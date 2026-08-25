import { randomUUID } from 'node:crypto';
import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesService } from 'src/files/files.service';
import {
    MESSENGER_SERVICE,
    type MessengerMessageOptions,
    type MessengerService,
} from 'src/messenger/messenger.types';
import { OutboundDeliveryEntity } from './entities/outbound-delivery.entity';
import { OutboundDeliveriesService } from './outbound-deliveries.service';
import { StaffNotificationAuthorizationService } from './staff-notification-authorization.service';

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];
const STALE_CLAIM_MS = 5 * 60_000;
const DEFAULT_BATCH_SIZE = 10;

@Injectable()
export class OutboundDeliveryProcessor
    implements OnApplicationBootstrap, OnApplicationShutdown
{
    private readonly logger = new Logger(OutboundDeliveryProcessor.name);
    private timer?: NodeJS.Timeout;
    private activeRun?: Promise<void>;
    private stopping = false;

    constructor(
        private readonly outbound: OutboundDeliveriesService,
        private readonly staffAuthorization: StaffNotificationAuthorizationService,
        private readonly files: FilesService,
        @Inject(MESSENGER_SERVICE)
        private readonly messenger: MessengerService,
        private readonly config: ConfigService,
    ) {}

    onApplicationBootstrap() {
        if (!this.config.get<boolean>('OUTBOUND_DELIVERY_WORKER_ENABLED')) {
            return;
        }
        const interval = this.config.get<number>(
            'OUTBOUND_DELIVERY_POLL_INTERVAL_MS',
            5000,
        );
        this.timer = setInterval(() => this.scheduleRun(), interval);
        this.timer.unref();
        this.scheduleRun();
    }

    async onApplicationShutdown() {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        await this.activeRun;
    }

    async processBatch(now = new Date(), limit = DEFAULT_BATCH_SIZE) {
        const claimed = await this.claimEligible(now, limit);
        for (const delivery of claimed) {
            await this.processClaimed(delivery);
        }
        return claimed.length;
    }

    private scheduleRun() {
        if (this.stopping || this.activeRun) return;
        this.activeRun = this.processBatch()
            .then(() => undefined)
            .catch((error: unknown) => {
                this.logger.error(
                    'Outbound delivery worker iteration failed',
                    error,
                );
            })
            .finally(() => {
                this.activeRun = undefined;
            });
    }

    private async claimEligible(now: Date, limit: number) {
        const queryRunner = this.outbound.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const claimToken = randomUUID();
            const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
            await queryRunner.query(
                `UPDATE "outbound_deliveries"
                 SET "status" = 'failed',
                     "nextAttemptAt" = $1,
                     "claimedAt" = NULL,
                     "claimToken" = NULL,
                     "lastError" = 'Stale processing claim reached the retry limit; previous provider outcome is indeterminate',
                     "updatedAt" = $1
                 WHERE "status" = 'processing'
                   AND COALESCE("claimedAt", "updatedAt") <= $2
                   AND "attemptCount" >= $3`,
                [now, staleBefore, MAX_ATTEMPTS],
            );
            await queryRunner.query(
                `WITH candidates AS (
                    SELECT id
                    FROM "outbound_deliveries"
                    WHERE (
                        (
                            "status" IN ('pending', 'retrying')
                            AND "nextAttemptAt" <= $1
                        ) OR (
                            "status" = 'processing'
                            AND COALESCE("claimedAt", "updatedAt") <= $2
                        )
                    )
                    AND "attemptCount" < $5
                    ORDER BY COALESCE("nextAttemptAt", "createdAt"), id
                    FOR UPDATE SKIP LOCKED
                    LIMIT $3
                )
                UPDATE "outbound_deliveries" delivery
                SET "status" = 'processing',
                    "claimToken" = $4,
                    "claimedAt" = $1,
                    "lastAttemptAt" = $1,
                    "attemptCount" = delivery."attemptCount" + 1,
                    "lastError" = CASE
                        WHEN delivery."status" = 'processing'
                        THEN 'Recovered stale processing claim; previous provider outcome is indeterminate'
                        ELSE delivery."lastError"
                    END,
                    "updatedAt" = $1
                FROM candidates
                WHERE delivery.id = candidates.id
                RETURNING delivery.*`,
                [
                    now,
                    staleBefore,
                    Math.max(1, Math.min(limit, 100)),
                    claimToken,
                    MAX_ATTEMPTS,
                ],
            );
            await queryRunner.commitTransaction();
            return this.outbound.repository.find({
                where: { claimToken },
                order: { id: 'ASC' },
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async processClaimed(delivery: OutboundDeliveryEntity) {
        let providerResult: unknown;
        try {
            const authorization =
                await this.staffAuthorization.authorizeDelivery(delivery);
            if (!authorization.authorized) {
                await this.recordAuthorizationRevoked(delivery);
                return;
            }
            providerResult = await this.send(delivery);
        } catch (error) {
            await this.recordFailure(delivery, error);
            return;
        }

        try {
            const result = await this.outbound.repository.update(
                {
                    id: delivery.id,
                    status: 'processing',
                    claimToken: delivery.claimToken!,
                },
                {
                    status: 'sent',
                    sentAt: new Date(),
                    nextAttemptAt: new Date(),
                    claimedAt: null,
                    claimToken: null,
                    providerMessageId:
                        this.providerMessageId(providerResult) ?? null,
                    lastError: null,
                },
            );
            if (result.affected !== 1) {
                this.logger.warn(
                    `Outbound delivery ${delivery.id} lost its claim after provider send`,
                );
            }
        } catch (error) {
            // The provider may already have accepted the message. Leaving this row
            // processing makes the indeterminate attempt recoverable after timeout.
            this.logger.error(
                `Failed to persist sent state for outbound delivery ${delivery.id}`,
                error,
            );
        }
    }

    private async send(delivery: OutboundDeliveryEntity) {
        const options: MessengerMessageOptions = {
            platform: delivery.platform,
            caption: delivery.payload.caption,
            parseMode: delivery.payload.parseMode,
            inlineKeyboard: delivery.payload.inlineKeyboard,
        };
        if (delivery.kind === 'text') {
            return this.messenger.sendMessage(
                delivery.recipientChatId,
                delivery.payload.text!,
                options,
            );
        }
        const { file, stream } = await this.files.open(delivery.storedFileId!);
        const document = {
            source: stream,
            filename: delivery.payload.filename || file.originalName,
        };
        return delivery.kind === 'image'
            ? this.messenger.sendImage(
                  delivery.recipientChatId,
                  document,
                  options,
              )
            : this.messenger.sendDocument(
                  delivery.recipientChatId,
                  document,
                  options,
              );
    }

    private async recordFailure(
        delivery: OutboundDeliveryEntity,
        error: unknown,
    ) {
        const terminal = delivery.attemptCount >= MAX_ATTEMPTS;
        const retryDelay = RETRY_DELAYS_MS[delivery.attemptCount - 1];
        const now = new Date();
        await this.outbound.repository.update(
            {
                id: delivery.id,
                status: 'processing',
                claimToken: delivery.claimToken!,
            },
            {
                status: terminal ? 'failed' : 'retrying',
                nextAttemptAt: terminal
                    ? now
                    : new Date(now.getTime() + retryDelay),
                claimedAt: null,
                claimToken: null,
                lastError: this.safeError(error),
            },
        );
        this.logger.warn(
            `Outbound delivery ${delivery.id} attempt ${delivery.attemptCount} ${terminal ? 'failed terminally' : 'will retry'}`,
        );
    }

    private async recordAuthorizationRevoked(delivery: OutboundDeliveryEntity) {
        const now = new Date();
        await this.outbound.repository.update(
            {
                id: delivery.id,
                status: 'processing',
                claimToken: delivery.claimToken!,
            },
            {
                status: 'failed',
                nextAttemptAt: now,
                claimedAt: null,
                claimToken: null,
                lastError: 'Staff notification authorization revoked',
            },
        );
        this.logger.warn(
            `Outbound delivery ${delivery.id} failed terminally because staff authorization was revoked`,
        );
    }

    private providerMessageId(result: unknown) {
        if (!result || typeof result !== 'object') return undefined;
        const record = result as Record<string, unknown>;
        const value = record.message_id ?? record.messageId ?? record.mid;
        return typeof value === 'string' || typeof value === 'number'
            ? String(value).slice(0, 255)
            : undefined;
    }

    private safeError(error: unknown) {
        const raw = error instanceof Error ? error.message : 'Unknown error';
        return raw
            .replace(/https?:\/\/\S+/gi, '[redacted-url]')
            .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
            .replace(/bot\d+:[\w-]+/gi, 'bot[redacted]')
            .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]')
            .slice(0, 1000);
    }
}

export const OUTBOUND_DELIVERY_POLICY = {
    maxAttempts: MAX_ATTEMPTS,
    retryDelaysMs: [...RETRY_DELAYS_MS],
    staleClaimMs: STALE_CLAIM_MS,
};
