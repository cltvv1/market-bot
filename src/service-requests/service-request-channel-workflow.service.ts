import * as path from 'path';
import { randomBytes } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CustomerActivityService } from 'src/customer-activity/customer-activity.service';
import { OutboundDeliveriesService } from 'src/outbound-deliveries/outbound-deliveries.service';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { UsersService } from 'src/users/users.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import {
    ServiceRequestEntity,
    ServiceRequestPriority,
    ServiceRequestStatus,
} from './entities/service-request.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import {
    defaultServiceTypes,
    serviceRequestFlows,
} from './service-request.flows';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { FilesService } from 'src/files/files.service';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { ServiceFormService } from './service-form.service';
import { transitionServiceRequest } from './service-request-status';
import {
    ServiceRequestAttachmentEntity,
    ServiceRequestAttachmentKind,
} from './entities/service-request-attachment.entity';

export interface ServiceRequestIdentity {
    platform: UserPlatform;
    chatId: string;
    username?: string;
    name?: string;
    organizationId?: number;
}

export interface ServiceRequestOperatorStateInput {
    priority?: ServiceRequestPriority;
    operatorComment?: string | null;
}

export interface ServiceRequestChannelExpectation {
    expectedStep?: number;
    expectedVersion?: number;
}

export class StaleServiceRequestChannelCommandException extends ConflictException {
    constructor() {
        super('Service request callback is no longer current');
    }
}

@Injectable()
export class ServiceRequestChannelWorkflowService {
    constructor(
        @InjectRepository(ServiceTypeEntity)
        private readonly serviceTypesRepo: Repository<ServiceTypeEntity>,
        @InjectRepository(ServiceRequestEntity)
        private readonly serviceRequestsRepo: Repository<ServiceRequestEntity>,
        @InjectRepository(ServiceRequestEventEntity)
        private readonly eventsRepo: Repository<ServiceRequestEventEntity>,
        private readonly usersService: UsersService,
        private readonly organizationsService: OrganizationsService,
        private readonly activityService: CustomerActivityService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly pdfService: PdfGeneratorService,
        private readonly outbound: OutboundDeliveriesService,
        private readonly filesService: FilesService,
        private readonly serviceForms: ServiceFormService,
        @InjectRepository(ServiceRequestAttachmentEntity)
        private readonly requestAttachments: Repository<ServiceRequestAttachmentEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async ensureDefaultTypes() {
        for (const item of defaultServiceTypes) {
            const existing = await this.serviceTypesRepo.findOne({
                where: { code: item.code },
            });
            if (!existing) {
                await this.serviceTypesRepo.save(
                    this.serviceTypesRepo.create({ ...item, isActive: true }),
                );
            }
        }
    }

    async getServiceTypes() {
        await this.ensureDefaultTypes();
        return this.serviceTypesRepo.find({
            where: { isActive: true },
            order: { id: 'ASC' },
        });
    }

    async getRequest(id: number) {
        return this.serviceRequestsRepo.findOne({ where: { id } });
    }

    async createFromOpportunity(input: {
        opportunityId: number;
        type: string;
        organizationId: number;
        cashRegisterId?: number;
        title: string;
        description: string | null;
        priority: ServiceRequestPriority;
        operatorId: number;
    }) {
        const existing = await this.serviceRequestsRepo
            .createQueryBuilder('request')
            .where(
                `request.answers ->> 'sourceOpportunityId' = :opportunityId`,
                {
                    opportunityId: String(input.opportunityId),
                },
            )
            .getOne();
        if (existing) return existing;

        await this.ensureDefaultTypes();
        const serviceTypeCode =
            input.type === 'fn_expiring' ? 'fn_replacement' : 'kkt_remote_work';
        const serviceType = await this.serviceTypesRepo.findOneByOrFail({
            code: serviceTypeCode,
        });
        const formVersionId = await this.getFormVersionId(serviceType);
        const request = await this.serviceRequestsRepo.save(
            this.serviceRequestsRepo.create({
                requestNumber: this.createRequestNumber(),
                serviceTypeId: serviceType.id,
                serviceTypeCode: serviceType.code,
                serviceTypeTitle: input.title,
                organizationId: input.organizationId,
                cashRegisterId: input.cashRegisterId ?? null,
                platform: 'web',
                source: 'integration',
                chatId: `opportunity:${input.opportunityId}`,
                status: 'review_required',
                customerStatus: 'received',
                formVersionId,
                currentStep: serviceRequestFlows[serviceType.flow].length,
                answers: {
                    sourceOpportunityId: input.opportunityId,
                    cashRegisterId: input.cashRegisterId ?? null,
                    problemDescription: input.description ?? input.title,
                },
                priority: input.priority,
                responsibleOperatorStaffId: input.operatorId,
            }),
        );
        await this.addEvent(
            request,
            'created',
            'operator',
            `Создано из внешнего сигнала #${input.opportunityId}`,
        );
        return request;
    }

    async getRequestDetails(id: number) {
        const request = await this.getRequest(id);
        if (!request) {
            throw new NotFoundException('Service request was not found');
        }

        const events = await this.eventsRepo.find({
            where: { serviceRequestId: id },
            order: { createdAt: 'ASC', id: 'ASC' },
        });

        return { request, events };
    }

    async listForClient(identity: ServiceRequestIdentity) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        return this.serviceRequestsRepo.find({
            where: [
                { userId: user.id },
                { chatId: identity.chatId, platform: identity.platform },
            ],
            order: { createdAt: 'DESC' },
            take: 50,
        });
    }

    async listForAdmin(
        status?: ServiceRequestStatus | 'active' | 'all',
        platform?: UserPlatform,
        assignedEngineerId?: number,
    ) {
        const query = this.serviceRequestsRepo
            .createQueryBuilder('request')
            .andWhere(
                `(request.status <> 'draft'
                    OR request.currentStep > 0
                    OR request.assignedEngineerId IS NOT NULL
                    OR request.responsibleOperatorStaffId IS NOT NULL
                    OR request.operatorComment IS NOT NULL)`,
            );

        if (status === 'active') {
            query.andWhere('request.status NOT IN (:...closedStatuses)', {
                closedStatuses: ['completed', 'closed', 'cancelled'],
            });
        } else if (status && status !== 'all') {
            query.andWhere('request.status = :status', { status });
        }
        if (platform) {
            query.andWhere('request.platform = :platform', { platform });
        }
        if (assignedEngineerId) {
            query.andWhere('request.assignedEngineerId = :assignedEngineerId', {
                assignedEngineerId,
            });
        }

        return query.orderBy('request.createdAt', 'DESC').take(100).getMany();
    }

    async start(identity: ServiceRequestIdentity, serviceTypeCode: string) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );

        let created = false;
        const { request, serviceType } = await this.withDraftLock(
            identity,
            serviceTypeCode,
            async (manager) => {
                await this.ensureDefaultTypes();
                const serviceType = await this.serviceTypesRepo.findOne({
                    where: { code: serviceTypeCode, isActive: true },
                });
                if (!serviceType) {
                    throw new BadRequestException('Service type was not found');
                }
                const requests = manager.getRepository(ServiceRequestEntity);
                const existing = await requests.findOne({
                    where: {
                        chatId: identity.chatId,
                        platform: identity.platform,
                        serviceTypeCode: serviceType.code,
                        status: 'draft',
                    },
                });
                if (existing) return { request: existing, serviceType };

                created = true;
                const formVersionId = await this.getFormVersionId(serviceType);
                const request = await requests.save(
                    requests.create({
                        requestNumber: this.createRequestNumber(),
                        serviceTypeId: serviceType.id,
                        serviceTypeCode: serviceType.code,
                        serviceTypeTitle: serviceType.title,
                        userId: user.id,
                        organizationId: identity.organizationId,
                        platform: identity.platform,
                        source: identity.platform,
                        chatId: identity.chatId,
                        status: 'draft',
                        customerStatus: 'received',
                        formVersionId,
                        currentStep: 0,
                        answers: {},
                        contactSnapshot: {
                            name: identity.name?.trim() || 'Клиент',
                            messenger: {
                                platform: identity.platform,
                                chatId: identity.chatId,
                            },
                            preferredChannel: identity.platform,
                        },
                    }),
                );
                return { request, serviceType };
            },
        );

        if (created) {
            await this.addEvent(
                request,
                'created',
                'client',
                `Создана заявка: ${serviceType.title}`,
            );
            await this.activityService.add({
                userId: user.id,
                organizationId: identity.organizationId,
                platform: identity.platform,
                chatId: identity.chatId,
                type: 'service_request_created',
                title: serviceType.title,
                description: `Создана сервисная заявка #${request.id}`,
                serviceRequestId: request.id,
            });
        }

        return this.present(request);
    }

    async startAtolConsent(identity: ServiceRequestIdentity) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );

        let created = false;
        const { request, serviceType } = await this.withDraftLock(
            identity,
            'atol_consent',
            async (manager) => {
                const serviceType = await this.ensureAtolConsentServiceType();
                const requests = manager.getRepository(ServiceRequestEntity);
                const existing = await requests.findOne({
                    where: {
                        chatId: identity.chatId,
                        platform: identity.platform,
                        serviceTypeCode: serviceType.code,
                        status: 'draft',
                    },
                });
                if (existing) return { request: existing, serviceType };

                created = true;
                const formVersionId = await this.getFormVersionId(serviceType);
                const request = await requests.save(
                    requests.create({
                        requestNumber: this.createRequestNumber(),
                        serviceTypeId: serviceType.id,
                        serviceTypeCode: serviceType.code,
                        serviceTypeTitle: serviceType.title,
                        userId: user.id,
                        organizationId: identity.organizationId,
                        platform: identity.platform,
                        source: identity.platform,
                        chatId: identity.chatId,
                        status: 'draft',
                        customerStatus: 'received',
                        formVersionId,
                        currentStep: 0,
                        answers: {},
                        contactSnapshot: {
                            name: identity.name?.trim() || 'Клиент',
                            messenger: {
                                platform: identity.platform,
                                chatId: identity.chatId,
                            },
                            preferredChannel: identity.platform,
                        },
                    }),
                );
                return { request, serviceType };
            },
        );

        if (created) {
            await this.addEvent(
                request,
                'created',
                'client',
                'Создан черновик согласия на доступ АТОЛ',
            );
            await this.activityService.add({
                userId: user.id,
                organizationId: identity.organizationId,
                platform: identity.platform,
                chatId: identity.chatId,
                type: 'service_request_created',
                title: serviceType.title,
                description: `Создан черновик согласия АТОЛ #${request.id}`,
                serviceRequestId: request.id,
            });
        }

        return this.presentAtolConsent(request);
    }

    async answerAtolConsent(identity: ServiceRequestIdentity, value: string) {
        const request = await this.getLatestAtolConsentDraft(identity);
        if (!request) {
            return null;
        }

        const step = this.getCurrentAtolConsentStep(request);
        if (!step) {
            return this.presentAtolConsent(request);
        }

        const normalizedValue = value.trim();
        if (!normalizedValue) {
            throw new BadRequestException('Consent answer value is required');
        }

        request.answers = {
            ...(request.answers || {}),
            [step.key]: normalizedValue,
        };
        request.currentStep += 1;

        let saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'answered', 'client', step.label, {
            key: step.key,
            value: normalizedValue,
        });

        if (
            !this.getCurrentAtolConsentStep(saved) &&
            !saved.generatedConsentFileId
        ) {
            const pdf = await this.pdfService.generateAtolConsentPdf({
                id: saved.id,
                city: this.answerAsString(saved.answers.city),
                clientName: this.answerAsString(saved.answers.clientName),
                inn: this.answerAsString(saved.answers.inn),
                representativeName: this.answerAsString(
                    saved.answers.representativeName,
                ),
                representativeBasis: this.answerAsString(
                    saved.answers.representativeBasis,
                ),
            });
            const generatedFile = await this.filesService.saveBuffer({
                purpose: 'atol-consent',
                buffer: pdf,
                originalName: `atol_consent_${saved.id}.pdf`,
                mimeType: 'application/pdf',
                serverGenerated: true,
                createdByCustomerId: saved.userId ?? undefined,
                metadata: { serviceRequestId: saved.id },
            });
            saved.generatedConsentFileId = generatedFile.id;
            saved = await this.serviceRequestsRepo.save(saved);
            await this.linkStoredFile(
                saved.id,
                generatedFile.id,
                'generated_consent',
            );
            await this.addEvent(
                saved,
                'generated',
                'system',
                'Сформирован PDF согласия на доступ АТОЛ',
                {
                    storedFileId: generatedFile.id,
                },
            );
        }

        return this.presentAtolConsent(saved);
    }

    async attachAtolConsentSignedFile(
        identity: ServiceRequestIdentity,
        file: { buffer: Buffer; fileName?: string },
    ) {
        const request = await this.getLatestAtolConsentDraft(identity);
        if (!request?.generatedConsentFileId) {
            return null;
        }

        const originalName = file.fileName || 'signed-consent.jpg';
        const storedFile = await this.filesService.saveBuffer({
            purpose: 'signed-document',
            buffer: file.buffer,
            originalName,
            mimeType: this.detectSignedDocumentMime(originalName),
            createdByCustomerId: request.userId ?? undefined,
            metadata: { serviceRequestId: request.id },
        });

        let saved: ServiceRequestEntity;
        try {
            saved = await this.dataSource.transaction(async (manager) => {
                const requests = manager.getRepository(ServiceRequestEntity);
                const locked = await requests.findOne({
                    where: { id: request.id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked || locked.status !== 'draft') {
                    throw new BadRequestException(
                        'ATOL consent request is no longer accepting a file',
                    );
                }
                locked.signedConsentFileId = storedFile.id;
                this.applyStatus(locked, 'review_required');
                const updated = await requests.save(locked);
                await this.linkStoredFile(
                    updated.id,
                    storedFile.id,
                    'signed_consent',
                    manager,
                );
                await this.addEvent(
                    updated,
                    'signed_received',
                    'client',
                    'Получено подписанное согласие на доступ АТОЛ',
                    { signedConsentName: originalName },
                    manager,
                );
                await this.notifyOperators(updated, manager);
                return updated;
            });
        } catch (error) {
            await this.filesService.logicalDelete(storedFile.id);
            throw error;
        }
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_created',
            title: saved.serviceTypeTitle,
            description: `Получено подписанное согласие АТОЛ по заявке #${saved.id}`,
            serviceRequestId: saved.id,
        });

        return this.presentAtolConsent(saved);
    }

    async cancelAtolConsentDraft(identity: ServiceRequestIdentity) {
        const request = await this.getLatestAtolConsentDraft(identity);
        if (!request) {
            return null;
        }

        if (request.generatedConsentFileId) {
            await this.filesService.logicalDelete(
                request.generatedConsentFileId,
            );
        }
        await this.eventsRepo.delete({ serviceRequestId: request.id });
        await this.serviceRequestsRepo.delete(request.id);

        return request;
    }

    async getLatestDraftForClient(
        identity: ServiceRequestIdentity,
        serviceTypeCodes?: string[],
    ) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        const items = await this.serviceRequestsRepo.find({
            where: [
                { userId: user.id, status: 'draft' },
                {
                    chatId: identity.chatId,
                    platform: identity.platform,
                    status: 'draft',
                },
            ],
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 10,
        });

        return serviceTypeCodes?.length
            ? (items.find((item) =>
                  serviceTypeCodes.includes(item.serviceTypeCode),
              ) ?? null)
            : (items[0] ?? null);
    }

    async getLatestWaitingPaymentForClient(identity: ServiceRequestIdentity) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        return this.serviceRequestsRepo.findOne({
            where: [
                { userId: user.id, status: 'waiting_payment' },
                {
                    chatId: identity.chatId,
                    platform: identity.platform,
                    status: 'waiting_payment',
                },
            ],
            order: { updatedAt: 'DESC', id: 'DESC' },
        });
    }

    async attachPaymentProof(
        identity: ServiceRequestIdentity,
        file: {
            buffer: Buffer;
            fileName?: string;
            mimeType?: string;
        },
    ) {
        const request = await this.getLatestWaitingPaymentForClient(identity);
        if (!request) {
            return null;
        }

        const storedFile = await this.filesService.saveBuffer({
            purpose: 'payment-proof',
            buffer: file.buffer,
            originalName: file.fileName || `payment_${request.id}`,
            mimeType: file.mimeType,
            createdByCustomerId: request.userId ?? undefined,
            metadata: { serviceRequestId: request.id },
        });
        let mutation: {
            saved: ServiceRequestEntity;
            previousFileId: number | null;
        };
        try {
            mutation = await this.dataSource.transaction(async (manager) => {
                const requests = manager.getRepository(ServiceRequestEntity);
                const locked = await requests.findOne({
                    where: { id: request.id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked || locked.status !== 'waiting_payment') {
                    throw new BadRequestException(
                        'Service request is no longer waiting for payment',
                    );
                }
                const previousFileId = locked.paymentProofFileId;
                locked.paymentProofFileId = storedFile.id;
                const saved = await requests.save(locked);
                await this.linkStoredFile(
                    saved.id,
                    storedFile.id,
                    'payment_proof',
                    manager,
                );
                await this.addEvent(
                    saved,
                    'payment_proof_attached',
                    'client',
                    'Клиент прикрепил платежное поручение',
                    { storedFileId: storedFile.id },
                    manager,
                );
                await this.adminNotificationsService.notify(
                    'serviceRequests',
                    `Клиент отправил платежное поручение по заявке #${saved.id}. Проверьте файл в админке.`,
                    {
                        dedupeKey: `service-request:${saved.id}:payment-proof:${storedFile.id}:staff`,
                        sourceType: 'service_request',
                        sourceId: saved.id,
                        manager,
                    },
                );
                return { saved, previousFileId };
            });
        } catch (error) {
            await this.filesService.logicalDelete(storedFile.id);
            throw error;
        }
        const { saved, previousFileId } = mutation;
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_payment_proof_attached',
            title: saved.serviceTypeTitle,
            description: `Получено платежное поручение по заявке #${saved.id}`,
            serviceRequestId: saved.id,
        });
        if (previousFileId && previousFileId !== storedFile.id) {
            await this.filesService.logicalDelete(previousFileId);
        }
        return this.present(saved);
    }

    async answerLatestDraft(
        identity: ServiceRequestIdentity,
        value: string,
        serviceTypeCodes?: string[],
    ) {
        const request = await this.getLatestDraftForClient(
            identity,
            serviceTypeCodes,
        );
        if (!request) {
            return null;
        }

        return this.answer(identity, request.id, value);
    }

    async answer(
        identity: ServiceRequestIdentity,
        requestId: number,
        value: string,
        expectation?: ServiceRequestChannelExpectation,
    ) {
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );
        const mutation = await this.dataSource.transaction(async (manager) => {
            const request = await manager
                .getRepository(ServiceRequestEntity)
                .findOne({
                    where: { id: requestId },
                    lock: { mode: 'pessimistic_write' },
                });
            if (
                !request ||
                request.chatId !== identity.chatId ||
                request.platform !== identity.platform
            ) {
                throw new NotFoundException('Service request was not found');
            }
            if (request.status !== 'draft') {
                throw new BadRequestException(
                    'Service request is not accepting answers',
                );
            }
            if (
                (expectation?.expectedStep !== undefined &&
                    request.currentStep !== expectation.expectedStep) ||
                (expectation?.expectedVersion !== undefined &&
                    request.version !== expectation.expectedVersion)
            ) {
                throw new StaleServiceRequestChannelCommandException();
            }

            const step = this.getCurrentStep(request);
            if (!step) {
                return { request, step: null, submitted: false };
            }

            const normalizedValue = this.normalizeStepValue(step.key, value);
            request.answers = {
                ...(request.answers || {}),
                [step.key]: normalizedValue,
            };
            request.currentStep += 1;

            if (!this.getCurrentStep(request)) {
                request.calculatedPrice = await this.calculatePrice(request);
            }

            let saved = await manager
                .getRepository(ServiceRequestEntity)
                .save(request);
            let submitted = false;
            if (
                !this.getCurrentStep(saved) &&
                !this.requiresClientConfirmation(saved)
            ) {
                this.applyStatus(saved, 'invoice_required');
                saved = await manager
                    .getRepository(ServiceRequestEntity)
                    .save(saved);
                submitted = true;
            }
            if (submitted) {
                await this.notifyOperators(saved, manager);
            }

            return { request: saved, step, submitted };
        });

        if (!mutation.step) {
            return this.present(mutation.request);
        }

        await this.addEvent(
            mutation.request,
            'answered',
            'client',
            mutation.step.label,
            {
                key: mutation.step.key,
                value: this.answerAsString(
                    mutation.request.answers[mutation.step.key],
                ),
            },
        );
        await this.activityService.add({
            userId: mutation.request.userId,
            organizationId: mutation.request.organizationId,
            platform: mutation.request.platform,
            chatId: mutation.request.chatId,
            type: 'service_request_answered',
            title: mutation.request.serviceTypeTitle,
            description: mutation.step.label,
            serviceRequestId: mutation.request.id,
            payload: { key: mutation.step.key },
        });

        if (mutation.submitted) {
            await this.addEvent(
                mutation.request,
                'submitted',
                'client',
                'Service request submitted to operator',
            );
        }

        return this.present(mutation.request);
    }

    async confirmPrice(
        identity: ServiceRequestIdentity,
        requestId: number,
        expectation?: ServiceRequestChannelExpectation,
    ) {
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );
        const mutation = await this.dataSource.transaction(async (manager) => {
            const request = await manager
                .getRepository(ServiceRequestEntity)
                .findOne({
                    where: { id: requestId },
                    lock: { mode: 'pessimistic_write' },
                });
            if (
                !request ||
                request.chatId !== identity.chatId ||
                request.platform !== identity.platform
            ) {
                throw new NotFoundException('Service request was not found');
            }
            if (
                (expectation?.expectedStep !== undefined &&
                    request.currentStep !== expectation.expectedStep) ||
                (expectation?.expectedVersion !== undefined &&
                    request.version !== expectation.expectedVersion)
            ) {
                throw new StaleServiceRequestChannelCommandException();
            }
            if (this.getCurrentStep(request)) {
                throw new BadRequestException(
                    'Service request has unanswered questions',
                );
            }
            if (request.status === 'invoice_required') {
                return { request, confirmed: false };
            }
            if (request.status !== 'draft') {
                throw new BadRequestException(
                    'Service request cannot be confirmed in its current state',
                );
            }

            this.applyStatus(request, 'invoice_required');
            const saved = await manager
                .getRepository(ServiceRequestEntity)
                .save(request);
            await this.notifyOperators(saved, manager);
            return {
                request: saved,
                confirmed: true,
            };
        });

        if (mutation.confirmed) {
            await this.addEvent(
                mutation.request,
                'price_confirmed',
                'client',
                'Клиент согласился со стоимостью',
            );
            await this.activityService.add({
                userId: mutation.request.userId,
                organizationId: mutation.request.organizationId,
                platform: mutation.request.platform,
                chatId: mutation.request.chatId,
                type: 'service_request_price_confirmed',
                title: mutation.request.serviceTypeTitle,
                description: `Клиент согласился со стоимостью ${mutation.request.calculatedPrice ?? 0} руб.`,
                serviceRequestId: mutation.request.id,
            });
        }

        return this.present(mutation.request);
    }

    async attachInvoice(
        id: number,
        invoiceStoredFileId: number,
        operatorStaffId: number,
    ) {
        const saved = await this.dataSource.transaction(async (manager) => {
            const requests = manager.getRepository(ServiceRequestEntity);
            const request = await requests.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!request)
                throw new NotFoundException('Service request was not found');
            request.invoiceStoredFileId = invoiceStoredFileId;
            this.applyStatus(request, 'waiting_payment');
            request.responsibleOperatorStaffId = operatorStaffId;
            const updated = await requests.save(request);
            await this.linkStoredFile(
                updated.id,
                invoiceStoredFileId,
                'invoice',
                manager,
            );
            await this.addEvent(
                updated,
                'invoice_attached',
                `staff:${operatorStaffId}`,
                'Оператор прикрепил счет',
                { storedFileId: invoiceStoredFileId },
                manager,
            );
            if (updated.platform === 'telegram' || updated.platform === 'max') {
                await this.outbound.enqueue(
                    {
                        dedupeKey: `service-request:${updated.id}:invoice:${invoiceStoredFileId}:customer`,
                        platform: updated.platform,
                        recipientChatId: updated.chatId,
                        kind: 'document',
                        audience: 'customer',
                        sourceType: 'service_request',
                        sourceId: updated.id,
                        storedFileId: invoiceStoredFileId,
                        payload: {
                            caption: `Счет по заявке #${updated.id} готов. Статус заявки: ожидает оплаты.\n\nПосле оплаты отправьте сюда PDF-файл или фотографию платежного поручения. Оператор проверит документ и подтвердит оплату.`,
                        },
                    },
                    { manager },
                );
            }
            return updated;
        });
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_invoice_attached',
            title: saved.serviceTypeTitle,
            description: 'Счет отправлен клиенту, заявка ожидает оплаты',
            serviceRequestId: saved.id,
        });

        return this.getRequestDetails(saved.id);
    }

    async scheduleVisit(
        id: number,
        visitAddress: string,
        visitTime: string | undefined,
        operatorComment: string | undefined,
        operatorStaffId: number,
    ) {
        const saved = await this.dataSource.transaction(async (manager) => {
            const requests = manager.getRepository(ServiceRequestEntity);
            const request = await requests.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!request)
                throw new NotFoundException('Service request was not found');
            this.applyStatus(request, 'scheduled');
            request.visitAddress = visitAddress;
            request.visitTime = visitTime ? new Date(visitTime) : null;
            request.operatorComment = operatorComment ?? null;
            request.responsibleOperatorStaffId = operatorStaffId;
            const updated = await requests.save(request);
            await this.addEvent(
                updated,
                'visit_scheduled',
                `staff:${operatorStaffId}`,
                'Назначен визит',
                { visitAddress, visitTime, operatorComment },
                manager,
            );
            if (updated.platform === 'telegram' || updated.platform === 'max') {
                const timeText = updated.visitTime
                    ? ` Время: ${updated.visitTime.toLocaleString('ru-RU')}.`
                    : '';
                const commentText = updated.operatorComment
                    ? ` ${updated.operatorComment}`
                    : '';
                await this.outbound.enqueue(
                    {
                        dedupeKey: `service-request:${updated.id}:visit:v${updated.version}:customer`,
                        platform: updated.platform,
                        recipientChatId: updated.chatId,
                        kind: 'text',
                        audience: 'customer',
                        sourceType: 'service_request',
                        sourceId: updated.id,
                        payload: {
                            text: `По заявке #${updated.id}: приходите по адресу ${visitAddress}.${timeText}${commentText}`,
                        },
                    },
                    { manager },
                );
            }
            return updated;
        });
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_visit_scheduled',
            title: saved.serviceTypeTitle,
            description: `Назначен визит: ${visitAddress}`,
            serviceRequestId: saved.id,
        });

        return this.getRequestDetails(saved.id);
    }

    async updateOperatorState(
        id: number,
        input: ServiceRequestOperatorStateInput,
        operatorStaffId: number,
    ) {
        const request = await this.requireRequest(id);

        if (input.priority !== undefined) {
            request.priority = this.normalizePriority(input.priority);
        }
        request.responsibleOperatorStaffId = operatorStaffId;
        if (input.operatorComment !== undefined) {
            request.operatorComment = input.operatorComment?.trim() || null;
        }

        const saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(
            saved,
            'operator_state_updated',
            `staff:${operatorStaffId}`,
            'Оператор обновил рабочие поля заявки',
            {
                priority: saved.priority,
                responsibleOperatorStaffId: saved.responsibleOperatorStaffId,
                operatorComment: saved.operatorComment,
            },
        );

        return this.getRequestDetails(saved.id);
    }

    present(request: ServiceRequestEntity) {
        return {
            request,
            nextStep: this.getCurrentStep(request),
            isReadyForConfirmation:
                !this.getCurrentStep(request) && request.status === 'draft',
        };
    }

    private presentAtolConsent(request: ServiceRequestEntity) {
        return {
            request,
            nextStep: this.getCurrentAtolConsentStep(request),
            isReadyForConfirmation: false,
        };
    }

    private async ensureAtolConsentServiceType() {
        let serviceType = await this.serviceTypesRepo.findOne({
            where: { code: 'atol_consent' },
        });
        if (!serviceType) {
            serviceType = await this.serviceTypesRepo.save(
                this.serviceTypesRepo.create({
                    code: 'atol_consent',
                    title: 'Согласие на доступ АТОЛ',
                    description:
                        'Подписанное согласие клиента на дистанционный доступ и управление ККТ через кабинет АТОЛ.',
                    flow: 'simple',
                    isActive: false,
                    settings: null,
                }),
            );
        }
        return serviceType;
    }

    private async getLatestAtolConsentDraft(identity: ServiceRequestIdentity) {
        return this.serviceRequestsRepo.findOne({
            where: {
                chatId: identity.chatId,
                platform: identity.platform,
                serviceTypeCode: 'atol_consent',
                status: 'draft',
            },
            order: { createdAt: 'DESC', id: 'DESC' },
        });
    }

    private async withDraftLock<T>(
        identity: ServiceRequestIdentity,
        serviceTypeCode: string,
        handler: (manager: EntityManager) => Promise<T>,
    ): Promise<T> {
        return this.dataSource.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `service-request-draft:${identity.platform}:${identity.chatId}:${serviceTypeCode}`,
            ]);
            return handler(manager);
        });
    }

    private getCurrentAtolConsentStep(request: ServiceRequestEntity) {
        const steps = [
            {
                key: 'city',
                label: 'Укажите город. Если город Красноярск, просто напишите: Красноярск',
            },
            {
                key: 'clientName',
                label: 'Укажите полное название организации или ИП, как в документах',
            },
            { key: 'inn', label: 'Укажите ИНН' },
            {
                key: 'representativeName',
                label: 'В лице кого составляется согласие? Например: Иванова Ивана Ивановича',
            },
            {
                key: 'representativeBasis',
                label: 'На основании чего действует представитель? Например: Устава, свидетельства ОГРНИП, доверенности',
            },
        ];
        return steps[request.currentStep] ?? null;
    }

    private async getClientRequest(
        identity: ServiceRequestIdentity,
        id: number,
    ) {
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );
        const request = await this.requireRequest(id);
        if (
            request.chatId !== identity.chatId ||
            request.platform !== identity.platform
        ) {
            throw new NotFoundException('Service request was not found');
        }

        return request;
    }

    private async requireRequest(id: number) {
        const request = await this.serviceRequestsRepo.findOne({
            where: { id },
        });
        if (!request) {
            throw new NotFoundException('Service request was not found');
        }

        return request;
    }

    private normalizePriority(priority: ServiceRequestPriority) {
        const allowed: ServiceRequestPriority[] = [
            'low',
            'normal',
            'high',
            'urgent',
        ];
        if (!allowed.includes(priority)) {
            throw new BadRequestException('Invalid service request priority');
        }

        return priority;
    }

    private getCurrentStep(request: ServiceRequestEntity) {
        const flow =
            request.serviceTypeCode === 'fn_replacement'
                ? 'fn_replacement'
                : 'simple';
        return serviceRequestFlows[flow][request.currentStep] ?? null;
    }

    private normalizeStepValue(key: string, value: string) {
        const text = value.trim();
        if (!text) {
            throw new BadRequestException('Answer value is required');
        }

        if (key === 'fiscalDriveTerm' && text !== '15' && text !== '36') {
            throw new BadRequestException('Fiscal drive term must be 15 or 36');
        }

        return text;
    }

    private async calculatePrice(request: ServiceRequestEntity) {
        if (request.serviceTypeCode !== 'fn_replacement') {
            return null;
        }

        const serviceType = await this.serviceTypesRepo.findOne({
            where: { id: request.serviceTypeId },
        });
        const prices = serviceType?.settings?.prices as
            | Record<string, number>
            | undefined;
        const term = this.answerAsString(request.answers?.fiscalDriveTerm);
        return prices?.[term] ?? null;
    }

    private answerAsString(value: unknown): string {
        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return String(value);
        }
        return '';
    }

    private requiresClientConfirmation(request: ServiceRequestEntity) {
        return request.serviceTypeCode === 'fn_replacement';
    }

    private async notifyOperators(
        request: ServiceRequestEntity,
        manager?: EntityManager,
    ) {
        const message = this.formatOperatorMessage(request);
        await this.adminNotificationsService.notify(
            'serviceRequests',
            message,
            {
                dedupeKey: `service-request:${request.id}:${request.status}:v${request.version}:staff`,
                sourceType: 'service_request',
                sourceId: request.id,
                manager,
            },
        );
    }

    private formatOperatorMessage(request: ServiceRequestEntity) {
        const answerLines =
            Object.entries(request.answers || {})
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join('\n') || 'No answers';
        const priceLine = request.calculatedPrice
            ? `\nPrice: ${request.calculatedPrice} RUB`
            : '';

        return (
            `New service request #${request.id}: ${request.serviceTypeTitle}\n\n` +
            `${answerLines}${priceLine}\n\n` +
            `Open the admin panel to process it.`
        );
    }

    private async addEvent(
        request: ServiceRequestEntity,
        type: string,
        actor: string,
        message?: string,
        payload?: Record<string, unknown>,
        manager?: EntityManager,
    ) {
        const repository = manager
            ? manager.getRepository(ServiceRequestEventEntity)
            : this.eventsRepo;
        await repository.save(
            repository.create({
                serviceRequestId: request.id,
                type,
                actor,
                message: message ?? null,
                payload: payload ?? null,
            }),
        );
    }

    private detectSignedDocumentMime(fileName: string) {
        const extension = path.extname(fileName).toLowerCase();
        if (extension === '.pdf') return 'application/pdf';
        if (extension === '.png') return 'image/png';
        if (extension === '.webp') return 'image/webp';
        return 'image/jpeg';
    }

    private applyStatus(
        request: ServiceRequestEntity,
        status: ServiceRequestStatus,
    ) {
        transitionServiceRequest(request, status);
        if (status !== 'draft' && !request.submittedAt)
            request.submittedAt = new Date();
    }

    private createRequestNumber() {
        const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        return `SR-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
    }

    private async getFormVersionId(serviceType: ServiceTypeEntity) {
        return (await this.serviceForms.getPublishedForType(serviceType)).id;
    }

    private async linkStoredFile(
        serviceRequestId: number,
        storedFileId: number,
        kind: ServiceRequestAttachmentKind,
        manager?: EntityManager,
    ) {
        const repository = manager
            ? manager.getRepository(ServiceRequestAttachmentEntity)
            : this.requestAttachments;
        await repository.delete({ serviceRequestId, kind });
        await repository.save(
            repository.create({
                serviceRequestId,
                storedFileId,
                kind,
                customerVisible: true,
                uploadedByCustomerId: null,
                uploadedByStaffId: null,
            }),
        );
    }
}
