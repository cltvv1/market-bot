import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AdminPrincipal } from '../admin/admin-auth.types';
import type {
    ScheduleServiceRequestDto,
    ServiceRequestOperatorStateDto,
} from '../admin/dto/admin-api.dto';
import { AdminUserEntity } from '../admin/entities/admin-user.entity';
import { AuditService } from '../audit/audit.service';
import { CustomerActivityEntity } from '../customer-activity/entities/customer-activity.entity';
import { FilesService } from '../files/files.service';
import { StoredFileEntity } from '../files/entities/stored-file.entity';
import { assertFilePolicy } from '../files/file-policies';
import { OutboundDeliveriesService } from '../outbound-deliveries/outbound-deliveries.service';
import {
    ServiceRequestEntity,
    type ServiceRequestStatus,
} from './entities/service-request.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceRequestMessageEntity } from './entities/service-request-message.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import {
    serviceRequestWorkflow,
    serviceTransitionActions,
    type ServiceAdminActionId,
} from './service-request-admin-policy';
import { ServiceRequestAdminReadService } from './service-request-admin-read.service';
import { transitionServiceRequest } from './service-request-status';

@Injectable()
export class ServiceRequestAdminCommandsService {
    private readonly logger = new Logger(
        ServiceRequestAdminCommandsService.name,
    );
    constructor(
        private readonly db: DataSource,
        private readonly read: ServiceRequestAdminReadService,
        private readonly audit: AuditService,
        private readonly outbound: OutboundDeliveriesService,
        private readonly files: FilesService,
    ) {}

    async transition(
        admin: AdminPrincipal,
        id: number,
        target: ServiceRequestStatus,
        version: number,
    ) {
        const action = serviceTransitionActions[target];
        if (!action)
            throw new BadRequestException(
                'Use the dedicated invoice or visit command',
            );
        await this.locked(admin, id, version, async (row, manager) => {
            this.assertAction(row, admin, action);
            const from = row.status;
            transitionServiceRequest(row, target);
            row.responsibleOperatorStaffId = admin.id;
            await manager.save(row);
            await this.event(
                manager,
                row,
                admin,
                'status_changed',
                `Статус изменён: ${target}`,
                { from, status: target },
            );
            await this.record(manager, row, admin, 'status.transition', {
                from,
                status: target,
            });
            const texts: Partial<Record<ServiceRequestStatus, string>> = {
                paid: `Оплата по заявке ${row.requestNumber} получена.`,
                completed: `Работа по заявке ${row.requestNumber} выполнена.`,
                closed: `Заявка ${row.requestNumber} закрыта.`,
                cancelled: `Заявка ${row.requestNumber} отменена.`,
            };
            if (texts[target])
                await this.enqueue(
                    manager,
                    row,
                    `service-request:${row.id}:status:${target}:v${row.version}:customer`,
                    texts[target],
                );
        });
        return this.read.detail(admin, id);
    }

    async assign(
        admin: AdminPrincipal,
        id: number,
        engineerId: number,
        version: number,
    ) {
        await this.locked(admin, id, version, async (row, manager) => {
            this.assertAction(row, admin, 'assign_engineer');
            const engineer = await manager
                .getRepository(AdminUserEntity)
                .createQueryBuilder('staff')
                .innerJoin(
                    'staff.roleAssignments',
                    'role',
                    'role.role = :role',
                    { role: 'engineer' },
                )
                .where('staff.id = :id AND staff.isActive = true', {
                    id: engineerId,
                })
                .setLock('pessimistic_read')
                .getOne();
            if (!engineer)
                throw new BadRequestException(
                    'Active engineer staff account was not found',
                );
            if (row.assignedEngineerId === engineerId) return;
            row.assignedEngineerId = engineerId;
            row.responsibleOperatorStaffId = admin.id;
            await manager.save(row);
            await this.event(
                manager,
                row,
                admin,
                'engineer_assigned',
                `Назначен инженер: ${engineer.displayName}`,
                { assignedEngineerId: engineerId },
            );
            await this.record(manager, row, admin, 'engineer.assign', {
                assignedEngineerId: engineerId,
            });
        });
        return this.read.detail(admin, id);
    }

    async operatorState(
        admin: AdminPrincipal,
        id: number,
        input: ServiceRequestOperatorStateDto,
    ) {
        await this.locked(
            admin,
            id,
            input.expectedVersion,
            async (row, manager) => {
                this.assertAction(row, admin, 'update_operator_state');
                const priority = input.priority ?? row.priority;
                const comment =
                    input.operatorComment === undefined
                        ? row.operatorComment
                        : input.operatorComment?.trim() || null;
                if (
                    priority === row.priority &&
                    comment === row.operatorComment
                )
                    return;
                row.priority = priority;
                row.operatorComment = comment;
                row.responsibleOperatorStaffId = admin.id;
                await manager.save(row);
                await this.event(
                    manager,
                    row,
                    admin,
                    'operator_state_updated',
                    'Обновлены приоритет и внутренний комментарий',
                    { priority },
                );
                await this.record(
                    manager,
                    row,
                    admin,
                    'operator_state.update',
                    { priority },
                );
            },
        );
        return this.read.detail(admin, id);
    }

    async message(
        admin: AdminPrincipal,
        id: number,
        input: { text: string; visibility?: 'customer' | 'internal' },
    ) {
        const text = input.text.trim();
        if (!text || text.length > 10_000)
            throw new BadRequestException(
                'Message text is required and must not exceed 10000 characters',
            );
        const visibility = input.visibility ?? 'customer';
        await this.locked(admin, id, null, async (row, manager) => {
            this.assertAction(
                row,
                admin,
                visibility === 'customer'
                    ? 'send_customer_message'
                    : 'add_internal_note',
            );
            const repository = manager.getRepository(
                ServiceRequestMessageEntity,
            );
            const message = await repository.save(
                repository.create({
                    serviceRequestId: id,
                    authorType: 'staff',
                    authorStaffId: admin.id,
                    authorCustomerId: null,
                    visibility,
                    text,
                    storedFileId: null,
                }),
            );
            if (visibility === 'customer')
                await this.enqueue(
                    manager,
                    row,
                    `service-request-message:${message.id}:customer`,
                    text,
                );
            await this.record(manager, row, admin, 'message.add', {
                visibility,
                messageId: message.id,
            });
        });
        return this.read.detail(admin, id);
    }

    async invoice(
        admin: AdminPrincipal,
        id: number,
        version: number,
        file: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        // Reuse strict PDF signature/extension validation without changing other media purposes.
        assertFilePolicy(
            'order-invoice',
            file.buffer,
            file.mimetype,
            false,
            file.originalname,
        );
        const stored = await this.files.savePendingBuffer({
            purpose: 'service-invoice',
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            createdByStaffId: admin.id,
            metadata: { serviceRequestId: id },
        });
        try {
            await this.locked(admin, id, version, async (row, manager) => {
                this.assertAction(
                    row,
                    admin,
                    row.invoiceStoredFileId
                        ? 'replace_invoice'
                        : 'upload_invoice',
                );
                const previous = row.invoiceStoredFileId;
                const files = manager.getRepository(StoredFileEntity);
                const pending = await files.findOne({
                    where: { id: stored.id, status: 'pending' },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!pending)
                    throw new BadRequestException(
                        'Invoice upload is no longer available',
                    );
                pending.status = 'active';
                await files.save(pending);
                row.invoiceStoredFileId = pending.id;
                transitionServiceRequest(row, 'waiting_payment');
                row.responsibleOperatorStaffId = admin.id;
                await manager.save(row);
                const attachments = manager.getRepository(
                    ServiceRequestAttachmentEntity,
                );
                await attachments.save(
                    attachments.create({
                        serviceRequestId: id,
                        storedFileId: stored.id,
                        kind: 'invoice',
                        customerVisible: true,
                        uploadedByStaffId: admin.id,
                        uploadedByCustomerId: null,
                    }),
                );
                // Retain the previous attachment for historical delivery references, not as the current invoice.
                if (previous)
                    await attachments.update(
                        {
                            serviceRequestId: id,
                            storedFileId: previous,
                            kind: 'invoice',
                        },
                        { customerVisible: false },
                    );
                await this.event(
                    manager,
                    row,
                    admin,
                    'invoice_attached',
                    'Оператор прикрепил счёт',
                    { storedFileId: stored.id },
                );
                await this.record(manager, row, admin, 'invoice.upload', {
                    storedFileId: stored.id,
                });
                if (row.platform === 'telegram' || row.platform === 'max')
                    await this.outbound.enqueue(
                        {
                            dedupeKey: `service-request:${id}:invoice:${stored.id}:customer`,
                            platform: row.platform,
                            recipientChatId: row.chatId,
                            kind: 'document',
                            audience: 'customer',
                            sourceType: 'service_request',
                            sourceId: id,
                            storedFileId: stored.id,
                            payload: {
                                caption: `Счет по заявке #${id} готов. Статус заявки: ожидает оплаты.\n\nПосле оплаты отправьте сюда PDF-файл или фотографию платежного поручения. Оператор проверит документ и подтвердит оплату.`,
                            },
                        },
                        { manager },
                    );
                await this.activity(
                    manager,
                    row,
                    'service_request_invoice_attached',
                    'Счёт отправлен клиенту, заявка ожидает оплаты',
                );
            });
        } catch (error) {
            try {
                await this.files.rejectPendingById(stored.id);
            } catch {
                this.logger.error('Invoice pending-file cleanup failed');
            }
            throw error;
        }
        return this.read.detail(admin, id);
    }

    async schedule(
        admin: AdminPrincipal,
        id: number,
        input: ScheduleServiceRequestDto,
    ) {
        await this.locked(
            admin,
            id,
            input.expectedVersion,
            async (row, manager) => {
                this.assertAction(
                    row,
                    admin,
                    row.status === 'scheduled'
                        ? 'reschedule_visit'
                        : 'schedule_visit',
                );
                const address = input.visitAddress.trim();
                const time = new Date(input.visitTime);
                if (!address || !Number.isFinite(time.getTime()))
                    throw new BadRequestException(
                        'Visit address and time are required',
                    );
                const comment =
                    input.operatorComment === undefined
                        ? row.operatorComment
                        : input.operatorComment.trim() || null;
                if (
                    row.status === 'scheduled' &&
                    row.visitAddress === address &&
                    row.visitTime?.getTime() === time.getTime() &&
                    row.operatorComment === comment
                )
                    return;
                transitionServiceRequest(row, 'scheduled');
                row.visitAddress = address;
                row.visitTime = time;
                row.operatorComment = comment;
                row.responsibleOperatorStaffId = admin.id;
                await manager.save(row);
                await this.event(
                    manager,
                    row,
                    admin,
                    'visit_scheduled',
                    'Назначен визит',
                    { visitTime: time.toISOString() },
                );
                await this.record(manager, row, admin, 'visit.schedule');
                await this.enqueue(
                    manager,
                    row,
                    `service-request:${id}:visit:v${row.version}:customer`,
                    `По заявке #${id}: приходите по адресу ${address}. Время: ${time.toLocaleString('ru-RU')}.`,
                );
                await this.activity(
                    manager,
                    row,
                    'service_request_visit_scheduled',
                    `Назначен визит: ${address}`,
                );
            },
        );
        return this.read.detail(admin, id);
    }

    private async locked(
        admin: AdminPrincipal,
        id: number,
        version: number | null,
        run: (
            row: ServiceRequestEntity,
            manager: EntityManager,
        ) => Promise<void>,
    ) {
        if (
            version !== null &&
            (!Number.isInteger(version) ||
                version < 1 ||
                version > 2_147_483_647)
        )
            throw new BadRequestException('Invalid expectedVersion');
        try {
            await this.db.transaction(async (manager) => {
                const row = await manager
                    .getRepository(ServiceRequestEntity)
                    .findOne({
                        where: { id },
                        lock: { mode: 'pessimistic_write' },
                    });
                if (
                    !admin.permissions.includes('serviceRequests.read.all') &&
                    !admin.permissions.includes('serviceRequests.read.assigned')
                )
                    throw new ForbiddenException('Insufficient permissions');
                if (
                    !row ||
                    (!admin.permissions.includes('serviceRequests.read.all') &&
                        row.assignedEngineerId !== admin.id)
                )
                    throw new NotFoundException(
                        'Service request was not found',
                    );
                if (version !== null && row.version !== version)
                    throw new ConflictException(
                        'Service request was updated by another staff member',
                    );
                await run(row, manager);
            });
        } catch (error) {
            if (error instanceof ForbiddenException)
                await this.audit.record({
                    actorType: 'staff',
                    actorStaffId: admin.id,
                    actorSessionId: admin.sessionId,
                    action: 'permission.denied',
                    targetType: 'service_request',
                    targetId: id,
                    result: 'denied',
                });
            throw error;
        }
    }
    private assertAction(
        row: ServiceRequestEntity,
        admin: AdminPrincipal,
        id: ServiceAdminActionId,
    ) {
        const action = serviceRequestWorkflow(
            row,
            admin.permissions,
        ).actions.find((item) => item.id === id);
        if (!action) throw new ForbiddenException('Insufficient permissions');
        if (!action.allowed)
            throw new BadRequestException({
                message: action.reason,
                code: action.reasonCode,
            });
    }
    private record(
        manager: EntityManager,
        row: ServiceRequestEntity,
        admin: AdminPrincipal,
        suffix: string,
        metadata?: Record<string, unknown>,
    ) {
        return this.audit.record(
            {
                actorType: 'staff',
                actorStaffId: admin.id,
                actorSessionId: admin.sessionId,
                action: `service_request.${suffix}`,
                targetType: 'service_request',
                targetId: row.id,
                metadata,
            },
            manager,
        );
    }
    private event(
        manager: EntityManager,
        row: ServiceRequestEntity,
        admin: AdminPrincipal,
        type: string,
        message: string,
        payload?: Record<string, unknown>,
    ) {
        const events = manager.getRepository(ServiceRequestEventEntity);
        return events.save(
            events.create({
                serviceRequestId: row.id,
                actor: `staff:${admin.id}`,
                type,
                message,
                payload: payload ?? null,
            }),
        );
    }
    private async enqueue(
        manager: EntityManager,
        row: ServiceRequestEntity,
        dedupeKey: string,
        text: string,
    ) {
        if (row.platform !== 'telegram' && row.platform !== 'max') return;
        await this.outbound.enqueue(
            {
                dedupeKey,
                platform: row.platform,
                recipientChatId: row.chatId,
                kind: 'text',
                audience: 'customer',
                sourceType: 'service_request',
                sourceId: row.id,
                payload: { text },
            },
            { manager },
        );
    }
    private activity(
        manager: EntityManager,
        row: ServiceRequestEntity,
        type: CustomerActivityEntity['type'],
        description: string,
    ) {
        const activities = manager.getRepository(CustomerActivityEntity);
        return activities.save(
            activities.create({
                userId: row.userId,
                organizationId: row.organizationId,
                platform: row.platform,
                chatId: row.chatId,
                serviceRequestId: row.id,
                type,
                title: row.serviceTypeTitle,
                description,
            }),
        );
    }
}
