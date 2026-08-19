import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { AuditService } from 'src/audit/audit.service';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FilesService } from 'src/files/files.service';
import { OrganizationsService } from 'src/organizations/organizations.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import type {
    AdminCreateServiceRequestDto,
    CreateServiceRequestDraftDto,
} from './dto/canonical-service-request.dto';
import { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceRequestMessageEntity } from './entities/service-request-message.entity';
import {
    ServiceRequestContactSnapshot,
    ServiceRequestEntity,
    ServiceRequestSource,
    ServiceRequestStatus,
} from './entities/service-request.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import { ServiceFormService } from './service-form.service';
import { transitionServiceRequest } from './service-request-status';
import { defaultServiceTypes } from './service-request.flows';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';

@Injectable()
export class CanonicalServiceRequestsService {
    constructor(
        @InjectRepository(ServiceTypeEntity)
        private readonly serviceTypes: Repository<ServiceTypeEntity>,
        @InjectRepository(ServiceRequestEntity)
        private readonly requests: Repository<ServiceRequestEntity>,
        @InjectRepository(ServiceRequestEventEntity)
        private readonly events: Repository<ServiceRequestEventEntity>,
        @InjectRepository(ServiceRequestAttachmentEntity)
        private readonly attachments: Repository<ServiceRequestAttachmentEntity>,
        @InjectRepository(ServiceRequestMessageEntity)
        private readonly messages: Repository<ServiceRequestMessageEntity>,
        @InjectRepository(CashRegisterEntity)
        private readonly cashRegisters: Repository<CashRegisterEntity>,
        private readonly forms: ServiceFormService,
        private readonly organizations: OrganizationsService,
        private readonly files: FilesService,
        private readonly audit: AuditService,
        private readonly notifications: AdminNotificationsService,
        private readonly dataSource: DataSource,
        @Inject(MESSENGER_SERVICE)
        private readonly messenger: MessengerService,
    ) {}

    async getTypesWithForms() {
        await this.ensureDefaultTypes();
        const types = await this.serviceTypes.find({
            where: { isActive: true },
            order: { id: 'ASC' },
        });
        return Promise.all(
            types.map(async (type) => ({
                ...type,
                formVersion: await this.forms.getPublishedForType(type),
            })),
        );
    }

    async createWebDraft(
        session: WebSessionPrincipal,
        input: CreateServiceRequestDraftDto,
    ) {
        const type = await this.requireType(input.serviceTypeCode);
        const formVersion = await this.forms.getPublishedForType(type);
        const contact = this.normalizeContact(
            input.contactSnapshot,
            'web',
            session.chatId,
        );
        const organization = input.organizationId
            ? await this.organizations.assertUserOrganization(
                  session.chatId,
                  'web',
                  input.organizationId,
              )
            : null;
        await this.assertCashRegister(input.cashRegisterId, organization?.id);
        const answers = this.forms.validate(
            formVersion.schema,
            input.answers ?? {},
            false,
        );
        const result = await this.dataSource.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
                session.userId,
                type.id,
            ]);
            const repository = manager.getRepository(ServiceRequestEntity);
            const existing = await repository.findOne({
                where: {
                    userId: session.userId,
                    serviceTypeId: type.id,
                    source: 'web',
                    status: 'draft',
                },
                order: { createdAt: 'DESC' },
            });
            if (existing) return { request: existing, created: false };
            const request = repository.create({
                requestNumber: this.createRequestNumber(),
                serviceTypeId: type.id,
                serviceTypeCode: type.code,
                serviceTypeTitle: type.title,
                formVersionId: formVersion.id,
                userId: session.userId,
                organizationId: organization?.id,
                cashRegisterId: input.cashRegisterId ?? null,
                platform: 'web',
                source: 'web',
                chatId: session.chatId,
                status: 'draft',
                customerStatus: 'received',
                currentStep: 0,
                answers,
                contactSnapshot: contact,
                organizationSnapshot: organization
                    ? this.organizationSnapshot(organization)
                    : this.cleanSnapshot(input.organizationSnapshot),
                locationSnapshot: this.cleanSnapshot(input.locationSnapshot),
                equipmentSnapshot: this.cleanSnapshot(input.equipmentSnapshot),
                priority: this.priorityFromAnswers(answers),
            });
            const saved = await repository.save(request);
            await this.addEvent(
                saved.id,
                'draft_created',
                'customer',
                'Создан черновик заявки',
                undefined,
                manager,
            );
            return { request: saved, created: true };
        });
        if (result.created) {
            await this.audit.record({
                actorType: 'customer',
                actorCustomerId: session.userId,
                action: 'service_request.draft.create',
                targetType: 'service_request',
                targetId: result.request.id,
            });
        }
        return this.draftView(result.request);
    }

    async updateWebDraft(
        session: WebSessionPrincipal,
        id: number,
        answers: Record<string, unknown>,
        expectedVersion: number,
    ) {
        const request = await this.requireOwnedRequest(session.userId, id);
        if (request.status !== 'draft')
            throw new BadRequestException('Only a draft can be edited');
        if (request.version !== expectedVersion) {
            const alreadyApplied = Object.entries(answers).every(
                ([key, value]) =>
                    JSON.stringify(request.answers?.[key]) ===
                    JSON.stringify(value),
            );
            if (alreadyApplied) return this.draftView(request);
            throw new ConflictException(
                'Service request was updated in another session',
            );
        }
        const form = await this.requireForm(request.formVersionId);
        const merged = { ...(request.answers ?? {}), ...answers };
        const normalized = this.forms.validate(form.schema, merged, false);
        const result = await this.requests
            .createQueryBuilder()
            .update(ServiceRequestEntity)
            .set({
                answers: () => ':answers',
                priority: this.priorityFromAnswers(normalized),
            })
            .where(
                'id = :id AND "userId" = :userId AND status = :status AND version = :version',
                {
                    id,
                    userId: session.userId,
                    status: 'draft',
                    version: expectedVersion,
                },
            )
            .setParameters({ answers: JSON.stringify(normalized) })
            .execute();
        if (!result.affected)
            throw new ConflictException(
                'Service request was updated in another session',
            );
        await this.audit.record({
            actorType: 'customer',
            actorCustomerId: session.userId,
            action: 'service_request.draft.update',
            targetType: 'service_request',
            targetId: id,
            metadata: { fieldCount: Object.keys(answers).length },
        });
        return this.draftView(
            await this.requireOwnedRequest(session.userId, id),
        );
    }

    async submitWebDraft(
        session: WebSessionPrincipal,
        id: number,
        expectedVersion: number,
        idempotencyKey: string,
    ) {
        const rawToken = this.derivePublicToken(
            session.userId,
            id,
            idempotencyKey,
        );
        const saved = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(ServiceRequestEntity);
            const request = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!request || request.userId !== session.userId)
                throw new NotFoundException('Service request was not found');
            if (
                request.submitIdempotencyKey === idempotencyKey &&
                request.status !== 'draft'
            ) {
                request.publicTokenHash = this.hashToken(rawToken);
                return repository.save(request);
            }
            if (request.status !== 'draft')
                throw new BadRequestException(
                    'Service request has already been submitted',
                );
            if (request.version !== expectedVersion)
                throw new ConflictException(
                    'Service request was updated in another session',
                );
            const form = await this.requireForm(request.formVersionId, manager);
            request.answers = this.forms.validate(
                form.schema,
                request.answers,
                true,
            );
            this.assertContactReady(request.contactSnapshot);
            request.submitIdempotencyKey = idempotencyKey;
            request.publicTokenHash = this.hashToken(rawToken);
            transitionServiceRequest(request, 'submitted');
            const submitted = await repository.save(request);
            await this.addEvent(
                submitted.id,
                'submitted',
                'customer',
                'Заявка отправлена оператору',
                undefined,
                manager,
            );
            await manager.getRepository(ServiceRequestMessageEntity).save({
                serviceRequestId: submitted.id,
                authorType: 'system',
                authorCustomerId: null,
                authorStaffId: null,
                visibility: 'customer',
                text: 'Заявка принята и передана оператору.',
                storedFileId: null,
            });
            return submitted;
        });
        await this.notifications.notify(
            'serviceRequests',
            `Новая сервисная заявка ${saved.requestNumber}: ${saved.serviceTypeTitle}`,
        );
        await this.audit.record({
            actorType: 'customer',
            actorCustomerId: session.userId,
            action: 'service_request.submit',
            targetType: 'service_request',
            targetId: saved.id,
        });
        return { ...(await this.details(saved)), publicToken: rawToken };
    }

    async listForWeb(session: WebSessionPrincipal) {
        const items = await this.requests.find({
            where: { userId: session.userId },
            order: { createdAt: 'DESC' },
            take: 50,
        });
        return Promise.all(items.map((item) => this.details(item)));
    }

    async getForWeb(session: WebSessionPrincipal, id: number) {
        return this.details(await this.requireOwnedRequest(session.userId, id));
    }

    async getByPublicToken(token: string) {
        const request = await this.requests.findOne({
            where: { publicTokenHash: this.hashToken(token) },
        });
        if (!request)
            throw new NotFoundException('Service request was not found');
        return this.details(request);
    }

    async addWebAttachment(
        session: WebSessionPrincipal,
        id: number,
        file: { buffer: Buffer; originalName?: string; mimeType?: string },
    ) {
        const request = await this.requireOwnedRequest(session.userId, id);
        if (request.status !== 'draft')
            throw new BadRequestException(
                'Attachments can only be changed before submission',
            );
        const stored = await this.files.saveBuffer({
            purpose: 'service-attachment',
            buffer: file.buffer,
            originalName: file.originalName,
            mimeType: file.mimeType,
            createdByCustomerId: session.userId,
            metadata: { serviceRequestId: id },
        });
        try {
            const attachment = await this.dataSource.transaction(
                async (manager) => {
                    const locked = await manager
                        .getRepository(ServiceRequestEntity)
                        .findOne({
                            where: { id },
                            lock: { mode: 'pessimistic_write' },
                        });
                    if (
                        !locked ||
                        locked.userId !== session.userId ||
                        locked.status !== 'draft'
                    ) {
                        throw new BadRequestException(
                            'Attachments can only be changed before submission',
                        );
                    }
                    const repository = manager.getRepository(
                        ServiceRequestAttachmentEntity,
                    );
                    const count = await repository.count({
                        where: { serviceRequestId: id, kind: 'customer' },
                    });
                    if (count >= 5)
                        throw new BadRequestException(
                            'No more than five attachments are allowed',
                        );
                    return repository.save(
                        repository.create({
                            serviceRequestId: id,
                            storedFileId: stored.id,
                            kind: 'customer',
                            customerVisible: true,
                            uploadedByCustomerId: session.userId,
                            uploadedByStaffId: null,
                        }),
                    );
                },
            );
            await this.addEvent(
                id,
                'attachment_added',
                'customer',
                'К заявке добавлен файл',
                { attachmentId: attachment.id },
            );
            await this.audit.record({
                actorType: 'customer',
                actorCustomerId: session.userId,
                action: 'service_request.attachment.add',
                targetType: 'service_request',
                targetId: id,
                metadata: { attachmentId: attachment.id },
            });
            return this.attachmentView(attachment, stored);
        } catch (error) {
            await this.files.logicalDelete(stored.id);
            throw error;
        }
    }

    async removeWebAttachment(
        session: WebSessionPrincipal,
        id: number,
        attachmentId: number,
    ) {
        const attachment = await this.dataSource.transaction(
            async (manager) => {
                const request = await manager
                    .getRepository(ServiceRequestEntity)
                    .findOne({
                        where: { id },
                        lock: { mode: 'pessimistic_write' },
                    });
                if (
                    !request ||
                    request.userId !== session.userId ||
                    request.status !== 'draft'
                ) {
                    throw new NotFoundException('Attachment was not found');
                }
                const repository = manager.getRepository(
                    ServiceRequestAttachmentEntity,
                );
                const found = await repository.findOne({
                    where: {
                        id: attachmentId,
                        serviceRequestId: id,
                        kind: 'customer',
                    },
                });
                if (!found)
                    throw new NotFoundException('Attachment was not found');
                await repository.remove(found);
                return found;
            },
        );
        await this.files.logicalDelete(attachment.storedFileId);
        await this.addEvent(
            id,
            'attachment_removed',
            'customer',
            'Файл удалён из черновика',
        );
        await this.audit.record({
            actorType: 'customer',
            actorCustomerId: session.userId,
            action: 'service_request.attachment.remove',
            targetType: 'service_request',
            targetId: id,
            metadata: { attachmentId },
        });
        return { removed: true };
    }

    async addCustomerMessage(
        session: WebSessionPrincipal,
        id: number,
        text: string,
    ) {
        const request = await this.requireOwnedRequest(session.userId, id);
        if (['draft', 'closed', 'cancelled'].includes(request.status))
            throw new BadRequestException(
                'Messages are not accepted in the current status',
            );
        const message = await this.messages.save(
            this.messages.create({
                serviceRequestId: id,
                authorType: 'customer',
                authorCustomerId: session.userId,
                authorStaffId: null,
                visibility: 'customer',
                text: text.trim(),
                storedFileId: null,
            }),
        );
        if (request.status === 'clarification_required') {
            transitionServiceRequest(request, 'submitted');
            await this.requests.save(request);
        }
        await this.notifications.notify(
            'serviceRequests',
            `Новое сообщение клиента по заявке ${request.requestNumber}`,
        );
        await this.audit.record({
            actorType: 'customer',
            actorCustomerId: session.userId,
            action: 'service_request.message.add',
            targetType: 'service_request',
            targetId: request.id,
        });
        return message;
    }

    async addCustomerMessageAttachment(
        session: WebSessionPrincipal,
        id: number,
        file: { buffer: Buffer; originalName?: string; mimeType?: string },
    ) {
        const request = await this.requireOwnedRequest(session.userId, id);
        return this.storeCustomerMessageAttachment(
            request,
            file,
            session.userId,
        );
    }

    async addPublicMessage(token: string, text: string) {
        const request = await this.requests.findOne({
            where: { publicTokenHash: this.hashToken(token) },
        });
        if (!request)
            throw new NotFoundException('Service request was not found');
        if (['draft', 'closed', 'cancelled'].includes(request.status)) {
            throw new BadRequestException(
                'Messages are not accepted in the current status',
            );
        }
        const message = await this.messages.save(
            this.messages.create({
                serviceRequestId: request.id,
                authorType: 'customer',
                authorCustomerId: request.userId,
                authorStaffId: null,
                visibility: 'customer',
                text: text.trim(),
                storedFileId: null,
            }),
        );
        if (request.status === 'clarification_required') {
            transitionServiceRequest(request, 'submitted');
            await this.requests.save(request);
        }
        await this.notifications.notify(
            'serviceRequests',
            `Новое сообщение клиента по заявке ${request.requestNumber}`,
        );
        await this.audit.record({
            actorType: 'customer',
            actorCustomerId: request.userId,
            action: 'service_request.message.add',
            targetType: 'service_request',
            targetId: request.id,
        });
        return message;
    }

    async addPublicMessageAttachment(
        token: string,
        file: { buffer: Buffer; originalName?: string; mimeType?: string },
    ) {
        const request = await this.requests.findOne({
            where: { publicTokenHash: this.hashToken(token) },
        });
        if (!request)
            throw new NotFoundException('Service request was not found');
        return this.storeCustomerMessageAttachment(
            request,
            file,
            request.userId,
        );
    }

    async getAdminDetails(id: number) {
        return this.details(await this.requireRequest(id), true);
    }

    async createManual(adminId: number, input: AdminCreateServiceRequestDto) {
        const type = await this.requireType(input.serviceTypeCode);
        const form = await this.forms.getPublishedForType(type);
        const contact = this.normalizeContact(
            input.contactSnapshot,
            input.source,
        );
        const answers = this.forms.validate(
            form.schema,
            input.answers ?? {},
            false,
        );
        const request = await this.requests.save(
            this.requests.create({
                requestNumber: this.createRequestNumber(),
                serviceTypeId: type.id,
                serviceTypeCode: type.code,
                serviceTypeTitle: type.title,
                formVersionId: form.id,
                organizationId: input.organizationId,
                cashRegisterId: input.cashRegisterId ?? null,
                platform: 'web',
                source: input.source,
                chatId: `${input.source}:${randomUUID()}`,
                status: 'draft',
                customerStatus: 'received',
                currentStep: 0,
                answers,
                contactSnapshot: contact,
                organizationSnapshot: this.cleanSnapshot(
                    input.organizationSnapshot,
                ),
                locationSnapshot: this.cleanSnapshot(input.locationSnapshot),
                equipmentSnapshot: this.cleanSnapshot(input.equipmentSnapshot),
                priority: this.priorityFromAnswers(answers),
                responsibleOperatorStaffId: adminId,
                responsibleOperatorId: String(adminId),
            }),
        );
        if (input.initialStatus && input.initialStatus !== 'draft') {
            transitionServiceRequest(request, input.initialStatus);
            await this.requests.save(request);
        }
        await this.addEvent(
            request.id,
            'created',
            'staff',
            'Заявка создана сотрудником',
        );
        return this.details(request, true);
    }

    async addStaffMessage(
        adminId: number,
        id: number,
        text: string,
        visibility: 'customer' | 'internal',
    ) {
        const request = await this.requireRequest(id);
        const message = await this.messages.save(
            this.messages.create({
                serviceRequestId: id,
                authorType: 'staff',
                authorCustomerId: null,
                authorStaffId: adminId,
                visibility,
                text: text.trim(),
                storedFileId: null,
            }),
        );
        if (
            visibility === 'customer' &&
            (request.platform === 'telegram' || request.platform === 'max')
        ) {
            await this.messenger.sendMessage(request.chatId, text.trim(), {
                platform: request.platform,
            });
        }
        return message;
    }

    async transitionByStaff(
        adminId: number,
        id: number,
        target: ServiceRequestStatus,
        expectedVersion?: number,
    ) {
        const request = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(ServiceRequestEntity);
            const locked = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!locked)
                throw new NotFoundException('Service request was not found');
            if (expectedVersion && locked.version !== expectedVersion)
                throw new ConflictException(
                    'Service request was updated by another staff member',
                );
            const changed = transitionServiceRequest(locked, target);
            if (changed) {
                await repository.save(locked);
                await this.addEvent(
                    id,
                    'status_changed',
                    'staff',
                    `Статус изменён: ${target}`,
                    { staffId: adminId },
                    manager,
                );
            }
            return locked;
        });
        return this.details(request, true);
    }

    async openCustomerAttachment(
        session: WebSessionPrincipal,
        requestId: number,
        attachmentId: number,
    ) {
        await this.requireOwnedRequest(session.userId, requestId);
        return this.openAttachment(requestId, attachmentId);
    }

    async openPublicAttachment(token: string, attachmentId: number) {
        const request = await this.requests.findOne({
            where: { publicTokenHash: this.hashToken(token) },
        });
        if (!request)
            throw new NotFoundException('Service request was not found');
        return this.openAttachment(request.id, attachmentId);
    }

    async openAdminAttachment(requestId: number, attachmentId: number) {
        const attachment = await this.attachments.findOne({
            where: { id: attachmentId, serviceRequestId: requestId },
        });
        if (!attachment)
            throw new NotFoundException('Attachment was not found');
        return this.files.open(attachment.storedFileId);
    }

    private async openAttachment(requestId: number, attachmentId: number) {
        const attachment = await this.attachments.findOne({
            where: {
                id: attachmentId,
                serviceRequestId: requestId,
                customerVisible: true,
            },
        });
        if (!attachment)
            throw new NotFoundException('Attachment was not found');
        return this.files.open(attachment.storedFileId);
    }

    private async storeCustomerMessageAttachment(
        request: ServiceRequestEntity,
        file: { buffer: Buffer; originalName?: string; mimeType?: string },
        customerId?: number,
    ) {
        if (['draft', 'closed', 'cancelled'].includes(request.status)) {
            throw new BadRequestException(
                'Attachments are not accepted in the current status',
            );
        }
        const stored = await this.files.saveBuffer({
            purpose: 'service-attachment',
            buffer: file.buffer,
            originalName: file.originalName,
            mimeType: file.mimeType,
            createdByCustomerId: customerId,
            metadata: { serviceRequestId: request.id, context: 'message' },
        });
        try {
            const result = await this.dataSource.transaction(
                async (manager) => {
                    const locked = await manager
                        .getRepository(ServiceRequestEntity)
                        .findOne({
                            where: { id: request.id },
                            lock: { mode: 'pessimistic_write' },
                        });
                    if (
                        !locked ||
                        ['draft', 'closed', 'cancelled'].includes(locked.status)
                    ) {
                        throw new BadRequestException(
                            'Attachments are not accepted in the current status',
                        );
                    }
                    const attachment = await manager
                        .getRepository(ServiceRequestAttachmentEntity)
                        .save({
                            serviceRequestId: locked.id,
                            storedFileId: stored.id,
                            kind: 'message',
                            customerVisible: true,
                            uploadedByCustomerId: customerId ?? null,
                            uploadedByStaffId: null,
                        });
                    const message = await manager
                        .getRepository(ServiceRequestMessageEntity)
                        .save({
                            serviceRequestId: locked.id,
                            authorType: 'customer',
                            authorCustomerId: customerId ?? null,
                            authorStaffId: null,
                            visibility: 'customer',
                            text: null,
                            storedFileId: stored.id,
                        });
                    if (locked.status === 'clarification_required') {
                        transitionServiceRequest(locked, 'submitted');
                        await manager
                            .getRepository(ServiceRequestEntity)
                            .save(locked);
                    }
                    return { attachment, message };
                },
            );
            await this.notifications.notify(
                'serviceRequests',
                `Новый файл клиента по заявке ${request.requestNumber}`,
            );
            await this.audit.record({
                actorType: 'customer',
                actorCustomerId: customerId,
                action: 'service_request.message.attachment.add',
                targetType: 'service_request',
                targetId: request.id,
                metadata: { attachmentId: result.attachment.id },
            });
            return this.attachmentView(result.attachment, stored);
        } catch (error) {
            await this.files.logicalDelete(stored.id);
            throw error;
        }
    }

    private async details(
        request: ServiceRequestEntity,
        includeInternal = false,
    ) {
        const [messages, attachments] = await Promise.all([
            this.messages.find({
                where: includeInternal
                    ? { serviceRequestId: request.id }
                    : { serviceRequestId: request.id, visibility: 'customer' },
                order: { createdAt: 'ASC', id: 'ASC' },
            }),
            this.attachments.find({
                where: includeInternal
                    ? { serviceRequestId: request.id }
                    : { serviceRequestId: request.id, customerVisible: true },
                relations: { storedFile: true },
                order: { createdAt: 'ASC', id: 'ASC' },
            }),
        ]);
        return {
            request: includeInternal
                ? this.adminView(request)
                : this.customerView(request),
            messages,
            attachments: attachments.map((item) =>
                this.attachmentView(item, item.storedFile),
            ),
        };
    }

    private draftView(request: ServiceRequestEntity) {
        return {
            id: request.id,
            requestNumber: request.requestNumber,
            serviceTypeCode: request.serviceTypeCode,
            serviceTypeTitle: request.serviceTypeTitle,
            source: request.source,
            status: request.status,
            customerStatus: request.customerStatus,
            answers: request.answers,
            contactSnapshot: request.contactSnapshot,
            organizationSnapshot: request.organizationSnapshot,
            locationSnapshot: request.locationSnapshot,
            equipmentSnapshot: request.equipmentSnapshot,
            priority: request.priority,
            version: request.version,
            submittedAt: request.submittedAt,
            completedAt: request.completedAt,
            closedAt: request.closedAt,
            cancelledAt: request.cancelledAt,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
        };
    }

    private customerView(request: ServiceRequestEntity) {
        return {
            id: request.id,
            requestNumber: request.requestNumber,
            serviceTypeCode: request.serviceTypeCode,
            serviceTypeTitle: request.serviceTypeTitle,
            source: request.source,
            customerStatus: request.customerStatus,
            answers: request.answers,
            contactSnapshot: request.contactSnapshot,
            organizationSnapshot: request.organizationSnapshot,
            locationSnapshot: request.locationSnapshot,
            equipmentSnapshot: request.equipmentSnapshot,
            submittedAt: request.submittedAt,
            completedAt: request.completedAt,
            closedAt: request.closedAt,
            cancelledAt: request.cancelledAt,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
        };
    }

    private adminView(request: ServiceRequestEntity) {
        const { publicTokenHash, submitIdempotencyKey, ...view } = request;
        void publicTokenHash;
        void submitIdempotencyKey;
        return view;
    }

    private attachmentView(
        attachment: ServiceRequestAttachmentEntity,
        file: {
            id: number;
            originalName: string | null;
            mimeType: string;
            sizeBytes: string;
        },
    ) {
        return {
            id: attachment.id,
            kind: attachment.kind,
            customerVisible: attachment.customerVisible,
            file: {
                id: file.id,
                originalName: file.originalName,
                mimeType: file.mimeType,
                sizeBytes: Number(file.sizeBytes),
            },
            createdAt: attachment.createdAt,
        };
    }

    private async requireType(code: string) {
        await this.ensureDefaultTypes();
        const type = await this.serviceTypes.findOne({
            where: { code, isActive: true },
        });
        if (!type) throw new BadRequestException('Service type was not found');
        return type;
    }

    private async ensureDefaultTypes() {
        for (const item of defaultServiceTypes) {
            const existing = await this.serviceTypes.findOne({
                where: { code: item.code },
            });
            if (!existing) {
                await this.serviceTypes.save(
                    this.serviceTypes.create({ ...item, isActive: true }),
                );
            }
        }
    }

    private requireForm(id: number | null, manager?: EntityManager) {
        if (!id)
            throw new BadRequestException(
                'Service request has no form version',
            );
        const repository = manager
            ? manager.getRepository(ServiceFormVersionEntity)
            : this.dataSource.getRepository(ServiceFormVersionEntity);
        return repository.findOneByOrFail({ id });
    }

    private async requireRequest(id: number) {
        const request = await this.requests.findOne({ where: { id } });
        if (!request)
            throw new NotFoundException('Service request was not found');
        return request;
    }

    private async requireOwnedRequest(userId: number, id: number) {
        const request = await this.requests.findOne({ where: { id, userId } });
        if (!request)
            throw new NotFoundException('Service request was not found');
        return request;
    }

    private async assertCashRegister(
        cashRegisterId?: number,
        organizationId?: number,
    ) {
        if (!cashRegisterId) return;
        const register = await this.cashRegisters.findOne({
            where: { id: cashRegisterId },
        });
        if (
            !register ||
            !organizationId ||
            register.organizationId !== organizationId
        ) {
            throw new NotFoundException('Cash register was not found');
        }
    }

    private normalizeContact(
        input: Record<string, unknown>,
        source: ServiceRequestSource,
        chatId?: string,
    ): ServiceRequestContactSnapshot {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
        const email = typeof input.email === 'string' ? input.email.trim() : '';
        const preferred =
            typeof input.preferredChannel === 'string'
                ? input.preferredChannel
                : source;
        if (!name || name.length > 255)
            throw new BadRequestException('Contact name is required');
        if (source === 'web' && !phone)
            throw new BadRequestException(
                'Phone is required for a web request',
            );
        if (!phone && !email && !chatId)
            throw new BadRequestException('Phone or email is required');
        if (phone && !/^\+?[0-9 ()-]{7,25}$/.test(phone))
            throw new BadRequestException('Invalid contact phone');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new BadRequestException('Invalid contact email');
        const allowed = ['phone', 'email', 'telegram', 'max', 'web'];
        return {
            name,
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
            ...(chatId
                ? { messenger: { platform: 'web' as const, chatId } }
                : {}),
            preferredChannel: allowed.includes(preferred)
                ? (preferred as ServiceRequestContactSnapshot['preferredChannel'])
                : 'phone',
        };
    }

    private assertContactReady(contact: ServiceRequestContactSnapshot | null) {
        if (!contact?.name || (!contact.phone && !contact.messenger)) {
            throw new BadRequestException(
                'A contact name and phone or confirmed messenger are required',
            );
        }
    }

    private cleanSnapshot(value?: Record<string, unknown>) {
        if (!value) return null;
        const safe = Object.fromEntries(
            Object.entries(value)
                .slice(0, 50)
                .map(([key, item]) => [
                    key.slice(0, 100),
                    typeof item === 'string'
                        ? item.trim().slice(0, 2000)
                        : item,
                ]),
        );
        return Object.keys(safe).length ? safe : null;
    }

    private organizationSnapshot(organization: {
        id: number;
        inn: string;
        kpp: string | null;
        name: string | null;
        legalAddress: string | null;
    }) {
        return {
            verified: true,
            organizationId: organization.id,
            inn: organization.inn,
            kpp: organization.kpp,
            name: organization.name,
            legalAddress: organization.legalAddress,
        };
    }

    private priorityFromAnswers(answers: Record<string, unknown>) {
        return answers.urgency === 'critical'
            ? ('urgent' as const)
            : answers.urgency === 'urgent'
              ? ('high' as const)
              : ('normal' as const);
    }

    private createRequestNumber() {
        const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        return `SR-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('hex');
    }

    private derivePublicToken(
        userId: number,
        requestId: number,
        idempotencyKey: string,
    ) {
        return createHash('sha256')
            .update(`${userId}:${requestId}:${idempotencyKey}`)
            .digest('base64url');
    }

    private async addEvent(
        serviceRequestId: number,
        type: string,
        actor: string,
        message: string,
        payload?: Record<string, unknown>,
        manager?: EntityManager,
    ) {
        const repository = manager
            ? manager.getRepository(ServiceRequestEventEntity)
            : this.events;
        await repository.save(
            repository.create({
                serviceRequestId,
                type,
                actor,
                message,
                payload: payload ?? null,
            }),
        );
    }
}
