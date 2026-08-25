import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OutboundDeliveryEntity } from './entities/outbound-delivery.entity';
import type {
    EnqueueOutboundDeliveryInput,
    EnqueueOutboundDeliveryOptions,
} from './outbound-deliveries.types';

@Injectable()
export class OutboundDeliveriesService {
    constructor(
        @InjectRepository(OutboundDeliveryEntity)
        private readonly deliveries: Repository<OutboundDeliveryEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async enqueue(
        input: EnqueueOutboundDeliveryInput,
        options: EnqueueOutboundDeliveryOptions = {},
    ) {
        const normalized = this.normalize(input);
        const repository = options.manager
            ? options.manager.getRepository(OutboundDeliveryEntity)
            : this.deliveries;
        const result = await repository
            .createQueryBuilder()
            .insert()
            .into(OutboundDeliveryEntity)
            .values(normalized)
            .orIgnore()
            .execute();
        const delivery = await repository.findOneByOrFail({
            dedupeKey: normalized.dedupeKey,
        });
        this.assertSameIntent(delivery, normalized);
        return {
            delivery,
            created: Array.isArray(result.raw) && result.raw.length > 0,
        };
    }

    listForSource(sourceType: string, sourceId: string | number) {
        return this.deliveries
            .find({
                where: { sourceType, sourceId: String(sourceId) },
                order: { createdAt: 'ASC', id: 'ASC' },
            })
            .then((items) => items.map((item) => this.adminView(item)));
    }

    async get(id: number) {
        return this.deliveries.findOneBy({ id });
    }

    get repository() {
        return this.deliveries;
    }

    get connection() {
        return this.dataSource;
    }

    private normalize(input: EnqueueOutboundDeliveryInput) {
        const dedupeKey = input.dedupeKey.trim();
        const recipientChatId = String(input.recipientChatId).trim();
        const sourceType = input.sourceType.trim();
        const sourceId = String(input.sourceId).trim();
        if (!dedupeKey || !recipientChatId || !sourceType || !sourceId) {
            throw new Error(
                'Outbound delivery requires dedupeKey, recipient, source type and source ID',
            );
        }
        if (
            dedupeKey.length > 255 ||
            sourceType.length > 100 ||
            sourceId.length > 100
        ) {
            throw new Error('Outbound delivery identity is too long');
        }
        const recipientStaffId = input.recipientStaffId ?? null;
        if (
            (input.audience === 'staff' &&
                (!Number.isSafeInteger(recipientStaffId) ||
                    Number(recipientStaffId) <= 0)) ||
            (input.audience === 'customer' && recipientStaffId !== null)
        ) {
            throw new Error(
                'Staff deliveries require one trusted staff identity and customer deliveries must not include one',
            );
        }
        if (input.kind === 'text') {
            if (!input.payload.text?.trim() || input.storedFileId) {
                throw new Error(
                    'Text delivery requires text and no stored file',
                );
            }
        } else if (!input.storedFileId) {
            throw new Error(
                'Document and image deliveries require a stored file',
            );
        }
        return {
            dedupeKey,
            platform: input.platform,
            recipientChatId,
            kind: input.kind,
            audience: input.audience,
            recipientStaffId,
            sourceType,
            sourceId,
            payload: this.normalizePayload(input.payload),
            storedFileId: input.storedFileId ?? null,
            status: 'pending' as const,
            attemptCount: 0,
            nextAttemptAt: input.nextAttemptAt ?? new Date(),
            lastAttemptAt: null,
            claimedAt: null,
            claimToken: null,
            sentAt: null,
            providerMessageId: null,
            lastError: null,
        };
    }

    private assertSameIntent(
        existing: OutboundDeliveryEntity,
        input: ReturnType<OutboundDeliveriesService['normalize']>,
    ) {
        if (
            existing.platform !== input.platform ||
            existing.recipientChatId !== input.recipientChatId ||
            existing.kind !== input.kind ||
            existing.audience !== input.audience ||
            existing.recipientStaffId !== input.recipientStaffId ||
            existing.storedFileId !== input.storedFileId ||
            existing.sourceType !== input.sourceType ||
            existing.sourceId !== input.sourceId ||
            !isDeepStrictEqual(existing.payload, input.payload)
        ) {
            throw new Error(
                `Outbound delivery dedupe key ${input.dedupeKey} refers to another intent`,
            );
        }
    }

    private adminView(delivery: OutboundDeliveryEntity) {
        return {
            id: delivery.id,
            kind: delivery.kind,
            audience: delivery.audience,
            platform: delivery.platform,
            recipient: this.maskRecipient(delivery.recipientChatId),
            status: delivery.status,
            attemptCount: delivery.attemptCount,
            nextAttemptAt: delivery.nextAttemptAt,
            lastAttemptAt: delivery.lastAttemptAt,
            sentAt: delivery.sentAt,
            lastError: delivery.lastError,
            createdAt: delivery.createdAt,
            updatedAt: delivery.updatedAt,
        };
    }

    private maskRecipient(recipientChatId: string) {
        if (recipientChatId.length <= 4) return '***';
        return `***${recipientChatId.slice(-4)}`;
    }

    private normalizePayload(payload: EnqueueOutboundDeliveryInput['payload']) {
        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined),
        ) as EnqueueOutboundDeliveryInput['payload'];
    }
}
