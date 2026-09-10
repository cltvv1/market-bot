import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { AuditService } from 'src/audit/audit.service';
import { CustomerActivityService } from 'src/customer-activity/customer-activity.service';
import { FilesService } from 'src/files/files.service';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import type { ServiceRequestIdentity } from './service-request-channel-workflow.service';
import {
    paymentProofWorkflow,
    preparePaymentProof,
    type PaymentProofInput,
    type PaymentProofTarget,
} from './service-request-payment-proof';

interface ProofActor {
    userId: number;
    source: 'web' | 'telegram' | 'max';
    sessionId?: number;
    channel?: { platform: 'telegram' | 'max'; chatId: string };
}

@Injectable()
export class ServiceRequestPaymentProofService {
    private readonly logger = new Logger(
        ServiceRequestPaymentProofService.name,
    );

    constructor(
        private readonly db: DataSource,
        private readonly files: FilesService,
        private readonly audit: AuditService,
        private readonly activity: CustomerActivityService,
        private readonly notifications: AdminNotificationsService,
    ) {}

    async preflightForWeb(session: WebSessionPrincipal, id: number) {
        const row = await this.owned(id, session.userId);
        this.assertState(row);
    }

    attachForWeb(
        session: WebSessionPrincipal,
        requestId: number,
        expectedVersion: number,
        file: PaymentProofInput,
    ) {
        return this.attach(
            {
                userId: session.userId,
                sessionId: session.sessionId,
                source: 'web',
            },
            { requestId, expectedVersion },
            file,
        );
    }

    async attachForChannel(
        identity: ServiceRequestIdentity,
        target: PaymentProofTarget,
        file: PaymentProofInput,
    ) {
        if (identity.platform !== 'telegram' && identity.platform !== 'max')
            throw this.notFound();
        const user = await this.db.getRepository(UserEntity).findOneBy({
            platform: identity.platform,
            chatId: identity.chatId,
        });
        if (!user) throw this.notFound();
        return this.attach(
            {
                userId: user.id,
                source: identity.platform,
                channel: {
                    platform: identity.platform,
                    chatId: identity.chatId,
                },
            },
            target,
            file,
        );
    }

    async ownerView(session: WebSessionPrincipal, id: number) {
        const row = await this.owned(id, session.userId);
        return this.project(row);
    }

    async openForWeb(session: WebSessionPrincipal, id: number) {
        // Keep replacement serialized until the current file stream has been opened.
        return this.db.transaction(async (manager) => {
            const row = await this.owned(id, session.userId, manager);
            const bound = await this.current(row, manager);
            if (!bound || !(await this.available(bound.file)))
                throw this.notFound();
            try {
                return {
                    file: bound.file,
                    stream: await this.files.openStoredFile(bound.file),
                };
            } catch {
                throw this.notFound();
            }
        });
    }

    private async attach(
        actor: ProofActor,
        target: PaymentProofTarget,
        input: PaymentProofInput,
    ) {
        this.assertId(target.requestId);
        if (
            !Number.isInteger(target.expectedVersion) ||
            target.expectedVersion < 1 ||
            target.expectedVersion > 2_147_483_647
        ) {
            throw new BadRequestException(
                'A positive request version is required',
            );
        }
        const initial = await this.owned(
            target.requestId,
            actor.userId,
            undefined,
            actor.channel,
        );
        this.assertId(initial.userId);
        this.assertState(initial);
        const file = preparePaymentProof(input, target.requestId, actor.source);
        const stored = await this.files.savePendingBuffer({
            ...file,
            purpose: 'payment-proof',
            createdByCustomerId: initial.userId,
            metadata: {
                serviceRequestId: target.requestId,
                attachmentKind: 'payment_proof',
                source: actor.source,
            },
        });
        let committed: {
            request: ServiceRequestEntity;
            previousId: number | null;
            attachmentId: number;
        };
        try {
            committed = await this.db.transaction(async (manager) => {
                const row = await this.owned(
                    target.requestId,
                    actor.userId,
                    manager,
                    actor.channel,
                );
                if (
                    actor.channel &&
                    !(await manager
                        .getRepository(UserEntity)
                        .existsBy({ id: actor.userId, ...actor.channel }))
                ) {
                    throw this.notFound();
                }
                this.assertState(row);
                if (
                    row.version !== target.expectedVersion ||
                    row.userId !== initial.userId
                ) {
                    throw new ConflictException(
                        'Заявка изменилась. Обновите её состояние и повторите загрузку.',
                    );
                }
                const files = manager.getRepository(StoredFileEntity);
                const pending = await files.findOne({
                    where: { id: stored.id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (
                    !pending ||
                    pending.status !== 'pending' ||
                    pending.purgedAt !== null ||
                    pending.createdByStaffId !== null ||
                    pending.createdByCustomerId !== row.userId ||
                    pending.metadata?.purpose !== 'payment-proof' ||
                    pending.metadata.serviceRequestId !== row.id ||
                    pending.metadata.attachmentKind !== 'payment_proof' ||
                    pending.metadata.source !== actor.source ||
                    !(await this.files.exists(pending))
                ) {
                    throw new ConflictException(
                        'Payment proof upload is no longer available',
                    );
                }
                const previousId = row.paymentProofFileId;
                const attachments = manager.getRepository(
                    ServiceRequestAttachmentEntity,
                );
                await attachments.delete({
                    serviceRequestId: row.id,
                    kind: 'payment_proof',
                });
                const attachment = await attachments.save(
                    attachments.create({
                        serviceRequestId: row.id,
                        storedFileId: pending.id,
                        kind: 'payment_proof',
                        customerVisible: true,
                        uploadedByCustomerId: row.userId,
                        uploadedByStaffId: null,
                    }),
                );
                row.paymentProofFileId = pending.id;
                await manager.getRepository(ServiceRequestEntity).save(row);
                pending.metadata = {
                    ...pending.metadata,
                    serviceRequestAttachmentId: attachment.id,
                    canonical: true,
                };
                pending.status = 'active';
                await files.save(pending);
                const metadata = {
                    attachmentId: attachment.id,
                    replaced: previousId !== null,
                    source: actor.source,
                };
                await manager.getRepository(ServiceRequestEventEntity).save({
                    serviceRequestId: row.id,
                    type: 'payment_proof_attached',
                    actor: 'customer',
                    message: 'Клиент прикрепил платёжное поручение',
                    payload: metadata,
                });
                await this.audit.record(
                    {
                        actorType: 'customer',
                        actorCustomerId: row.userId,
                        actorWebSessionId: actor.sessionId,
                        action: 'service_request.payment_proof.upload',
                        targetType: 'service_request',
                        targetId: row.id,
                        metadata,
                    },
                    manager,
                );
                await this.activity.add(
                    {
                        userId: row.userId,
                        organizationId: row.organizationId,
                        platform: actor.source,
                        chatId: row.chatId,
                        type: 'service_request_payment_proof_attached',
                        title: 'Платёжное поручение',
                        description:
                            'Документ передан оператору для проверки оплаты',
                        serviceRequestId: row.id,
                    },
                    manager,
                );
                await this.notifications.notify(
                    'serviceRequests',
                    `Клиент отправил платёжное поручение по заявке #${row.id}. Проверьте документ в админке.`,
                    {
                        dedupeKey: `service-request:${row.id}:payment-proof:${attachment.id}:staff`,
                        sourceType: 'service_request',
                        sourceId: row.id,
                        manager,
                    },
                );
                return {
                    request: row,
                    previousId,
                    attachmentId: attachment.id,
                };
            });
        } catch (error) {
            try {
                await this.files.rejectPendingById(stored.id);
            } catch {
                this.logger.error('Payment proof pending-file cleanup failed');
            }
            throw error;
        }
        if (committed.previousId) {
            try {
                const previous = await this.files.get(committed.previousId);
                if (
                    previous.metadata?.purpose === 'payment-proof' &&
                    previous.metadata.serviceRequestId === target.requestId
                ) {
                    await this.files.logicalDelete(committed.previousId);
                } else {
                    this.logger.warn(
                        'Replaced payment proof binding does not permit retirement',
                    );
                }
            } catch {
                this.logger.error('Replaced payment proof retirement failed');
            }
        }
        // Build the response from committed data; no post-commit query may turn success into failure.
        return {
            request: {
                id: committed.request.id,
                status: committed.request.status,
            },
            documents: {
                paymentProof: this.document(
                    committed.request.id,
                    committed.attachmentId,
                    stored,
                    true,
                ),
            },
            customerWorkflow: paymentProofWorkflow(committed.request),
        };
    }

    private async owned(
        id: number,
        userId: number,
        manager?: EntityManager,
        channel?: ProofActor['channel'],
    ) {
        this.assertId(id);
        this.assertId(userId);
        const row = await (manager ?? this.db.manager)
            .getRepository(ServiceRequestEntity)
            .findOne({
                where: channel
                    ? [
                          { id, userId },
                          {
                              id,
                              platform: channel.platform,
                              chatId: channel.chatId,
                          },
                      ]
                    : { id, userId },
                ...(manager
                    ? { lock: { mode: 'pessimistic_write' as const } }
                    : {}),
            });
        if (!row) throw this.notFound();
        return row;
    }

    private assertId(id: number) {
        if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)
            throw this.notFound();
    }

    private assertState(row: ServiceRequestEntity) {
        const workflow = paymentProofWorkflow(row);
        if (!workflow.paymentProof.allowed)
            throw new ConflictException(workflow.paymentProof.reason!);
    }

    private async current(
        row: ServiceRequestEntity,
        manager = this.db.manager,
    ) {
        if (!row.paymentProofFileId) return null;
        const attachment = await manager
            .getRepository(ServiceRequestAttachmentEntity)
            .findOne({
                where: {
                    serviceRequestId: row.id,
                    storedFileId: row.paymentProofFileId,
                    kind: 'payment_proof',
                    customerVisible: true,
                },
                relations: { storedFile: true },
            });
        const file = attachment?.storedFile;
        if (
            !attachment ||
            !file ||
            attachment.uploadedByCustomerId !== row.userId ||
            attachment.uploadedByStaffId !== null ||
            file.createdByCustomerId !== row.userId ||
            file.createdByStaffId !== null ||
            file.metadata?.purpose !== 'payment-proof' ||
            file.metadata.serviceRequestId !== row.id ||
            file.metadata.attachmentKind !== 'payment_proof' ||
            file.metadata.serviceRequestAttachmentId !== attachment.id ||
            file.metadata.canonical !== true ||
            !['web', 'telegram', 'max'].includes(String(file.metadata.source))
        )
            return null;
        return { attachment, file };
    }

    private async available(file: StoredFileEntity) {
        if (file.status !== 'active' || file.purgedAt !== null) return false;
        try {
            return await this.files.exists(file);
        } catch {
            return false;
        }
    }

    private async project(row: ServiceRequestEntity) {
        const bound = await this.current(row);
        return {
            documents: {
                paymentProof: row.paymentProofFileId
                    ? this.document(
                          row.id,
                          bound?.attachment.id ?? null,
                          bound?.file,
                          bound ? await this.available(bound.file) : false,
                      )
                    : null,
            },
            customerWorkflow: paymentProofWorkflow(row),
        };
    }

    private document(
        requestId: number,
        attachmentId: number | null,
        file: StoredFileEntity | undefined,
        downloadable: boolean,
    ) {
        return {
            attachmentId,
            kind: 'payment_proof' as const,
            originalName: file?.originalName ?? null,
            mimeType: file?.mimeType ?? null,
            sizeBytes: file ? Number(file.sizeBytes) : null,
            createdAt: file?.createdAt ?? null,
            downloadable,
            downloadUrl: downloadable
                ? `/api/client/service-requests/${requestId}/payment-proof`
                : null,
        };
    }

    private notFound() {
        return new NotFoundException('Service request document was not found');
    }
}
