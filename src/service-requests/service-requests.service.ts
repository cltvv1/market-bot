import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerActivityService } from 'src/customer-activity/customer-activity.service';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { UsersService } from 'src/users/users.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { ServiceRequestEntity, ServiceRequestPriority, ServiceRequestStatus } from './entities/service-request.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import { defaultServiceTypes, serviceRequestFlows } from './service-request.flows';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { PdfGeneratorService } from 'src/pdf/pdf.service';

export interface ServiceRequestIdentity {
    platform: UserPlatform;
    chatId: string;
    username?: string;
    name?: string;
    organizationId?: number;
}

export interface ServiceRequestOperatorStateInput {
    priority?: ServiceRequestPriority;
    executorName?: string | null;
    operatorComment?: string | null;
}

@Injectable()
export class ServiceRequestsService {
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
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
    ) { }

    async ensureDefaultTypes() {
        for (const item of defaultServiceTypes) {
            const existing = await this.serviceTypesRepo.findOne({ where: { code: item.code } });
            if (!existing) {
                await this.serviceTypesRepo.save(this.serviceTypesRepo.create({ ...item, isActive: true }));
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
        const user = await this.usersService.getOrCreateOrUpdate(identity.chatId, identity.name, identity.username, identity.platform);
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
        return this.serviceRequestsRepo.find({
            where: {
                ...(status && status !== 'all' && status !== 'active' ? { status } : {}),
                ...(platform ? { platform } : {}),
                ...(assignedEngineerId ? { assignedEngineerId } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        }).then((items) => status === 'active'
            ? items.filter((item) => item.status !== 'completed' && item.status !== 'cancelled')
            : items);
    }

    async start(identity: ServiceRequestIdentity, serviceTypeCode: string) {
        const user = await this.usersService.getOrCreateOrUpdate(identity.chatId, identity.name, identity.username, identity.platform);
        await this.organizationsService.assertUserOrganization(identity.chatId, identity.platform, identity.organizationId);
        await this.ensureDefaultTypes();

        const serviceType = await this.serviceTypesRepo.findOne({ where: { code: serviceTypeCode, isActive: true } });
        if (!serviceType) {
            throw new BadRequestException('Service type was not found');
        }

        const request = await this.serviceRequestsRepo.save(this.serviceRequestsRepo.create({
            serviceTypeId: serviceType.id,
            serviceTypeCode: serviceType.code,
            serviceTypeTitle: serviceType.title,
            userId: user.id,
            organizationId: identity.organizationId,
            platform: identity.platform,
            chatId: identity.chatId,
            status: 'draft',
            currentStep: 0,
            answers: {},
        }));

        await this.addEvent(request, 'created', 'client', `Создана заявка: ${serviceType.title}`);
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

        return this.present(request);
    }

    async startAtolConsent(identity: ServiceRequestIdentity) {
        const user = await this.usersService.getOrCreateOrUpdate(identity.chatId, identity.name, identity.username, identity.platform);
        await this.organizationsService.assertUserOrganization(identity.chatId, identity.platform, identity.organizationId);
        const serviceType = await this.ensureAtolConsentServiceType();

        const existing = await this.getLatestAtolConsentDraft(identity);
        if (existing) {
            return this.presentAtolConsent(existing);
        }

        const request = await this.serviceRequestsRepo.save(this.serviceRequestsRepo.create({
            serviceTypeId: serviceType.id,
            serviceTypeCode: serviceType.code,
            serviceTypeTitle: serviceType.title,
            userId: user.id,
            organizationId: identity.organizationId,
            platform: identity.platform,
            chatId: identity.chatId,
            status: 'draft',
            currentStep: 0,
            answers: {},
        }));

        await this.addEvent(request, 'created', 'client', 'Создан черновик согласия на доступ АТОЛ');
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

        request.answers = { ...(request.answers || {}), [step.key]: normalizedValue };
        request.currentStep += 1;

        let saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'answered', 'client', step.label, { key: step.key, value: normalizedValue });

        if (!this.getCurrentAtolConsentStep(saved) && !saved.answers.generatedPdfPath) {
            const pdfPath = await this.pdfService.generateAtolConsentPdf({
                id: saved.id,
                city: String(saved.answers.city || ''),
                clientName: String(saved.answers.clientName || ''),
                inn: String(saved.answers.inn || ''),
                representativeName: String(saved.answers.representativeName || ''),
                representativeBasis: String(saved.answers.representativeBasis || ''),
            });
            saved.answers = { ...saved.answers, generatedPdfPath: pdfPath };
            saved = await this.serviceRequestsRepo.save(saved);
            await this.addEvent(saved, 'generated', 'system', 'Сформирован PDF согласия на доступ АТОЛ', { generatedPdfPath: pdfPath });
        }

        return this.presentAtolConsent(saved);
    }

    async attachAtolConsentSignedFile(identity: ServiceRequestIdentity, file: { buffer: Buffer; fileName?: string }) {
        const request = await this.getLatestAtolConsentDraft(identity);
        if (!request || !request.answers?.generatedPdfPath) {
            return null;
        }

        const dir = path.join(process.cwd(), 'storage', 'consents', String(request.id));
        await fs.promises.mkdir(dir, { recursive: true });

        const originalName = file.fileName || 'signed-consent.jpg';
        const safeName = originalName.replace(/[^a-zA-Z0-9_.-]+/g, '_');
        const filePath = path.join(dir, `signed_${Date.now()}_${safeName}`);
        await fs.promises.writeFile(filePath, file.buffer);

        request.answers = {
            ...(request.answers || {}),
            signedConsentPath: filePath,
            signedConsentName: originalName,
        };
        request.status = 'review_required';
        const saved = await this.serviceRequestsRepo.save(request);

        await this.addEvent(saved, 'signed_received', 'client', 'Получено подписанное согласие на доступ АТОЛ', {
            signedConsentName: originalName,
        });
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
        await this.notifyOperators(saved);

        return this.presentAtolConsent(saved);
    }

    async cancelAtolConsentDraft(identity: ServiceRequestIdentity) {
        const request = await this.getLatestAtolConsentDraft(identity);
        if (!request) {
            return null;
        }

        const consentDir = path.join(process.cwd(), 'storage', 'consents', String(request.id));
        await fs.promises.rm(consentDir, { recursive: true, force: true });
        await this.eventsRepo.delete({ serviceRequestId: request.id });
        await this.serviceRequestsRepo.delete(request.id);

        return request;
    }

    async getLatestDraftForClient(identity: ServiceRequestIdentity, serviceTypeCodes?: string[]) {
        const user = await this.usersService.getOrCreateOrUpdate(identity.chatId, identity.name, identity.username, identity.platform);
        const items = await this.serviceRequestsRepo.find({
            where: [
                { userId: user.id, status: 'draft' },
                { chatId: identity.chatId, platform: identity.platform, status: 'draft' },
            ],
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 10,
        });

        return serviceTypeCodes?.length
            ? items.find((item) => serviceTypeCodes.includes(item.serviceTypeCode)) ?? null
            : items[0] ?? null;
    }

    async answerLatestDraft(identity: ServiceRequestIdentity, value: string, serviceTypeCodes?: string[]) {
        const request = await this.getLatestDraftForClient(identity, serviceTypeCodes);
        if (!request) {
            return null;
        }

        return this.answer(identity, request.id, value);
    }

    async answer(identity: ServiceRequestIdentity, requestId: number, value: string) {
        const request = await this.getClientRequest(identity, requestId);
        if (request.status !== 'draft') {
            throw new BadRequestException('Service request is not accepting answers');
        }

        const step = this.getCurrentStep(request);
        if (!step) {
            return this.present(request);
        }

        const normalizedValue = this.normalizeStepValue(step.key, value);
        request.answers = { ...(request.answers || {}), [step.key]: normalizedValue };
        request.currentStep += 1;

        if (!this.getCurrentStep(request)) {
            request.calculatedPrice = await this.calculatePrice(request);
        }

        let saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'answered', 'client', step.label, { key: step.key, value: normalizedValue });
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_answered',
            title: saved.serviceTypeTitle,
            description: step.label,
            serviceRequestId: saved.id,
            payload: { key: step.key },
        });

        if (!this.getCurrentStep(saved) && !this.requiresClientConfirmation(saved)) {
            saved.status = 'invoice_required';
            saved = await this.serviceRequestsRepo.save(saved);
            await this.addEvent(saved, 'submitted', 'client', 'Service request submitted to operator');
            await this.notifyOperators(saved);
        }

        return this.present(saved);
    }

    async confirmPrice(identity: ServiceRequestIdentity, requestId: number) {
        const request = await this.getClientRequest(identity, requestId);
        if (this.getCurrentStep(request)) {
            throw new BadRequestException('Service request has unanswered questions');
        }

        request.status = 'invoice_required';
        const saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'price_confirmed', 'client', 'Клиент согласился со стоимостью');
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_price_confirmed',
            title: saved.serviceTypeTitle,
            description: `Клиент согласился со стоимостью ${saved.calculatedPrice ?? 0} руб.`,
            serviceRequestId: saved.id,
        });
        await this.notifyOperators(saved);

        return this.present(saved);
    }

    async attachInvoice(id: number, invoiceFileId: string, invoiceFileName?: string, operatorId = 'admin-panel') {
        const request = await this.requireRequest(id);
        request.invoiceFileId = invoiceFileId;
        request.invoiceFileName = invoiceFileName ?? invoiceFileId;
        request.status = 'waiting_payment';
        request.responsibleOperatorId = operatorId;
        const saved = await this.serviceRequestsRepo.save(request);

        await this.addEvent(saved, 'invoice_attached', operatorId, 'Оператор прикрепил счет', { invoiceFileId, invoiceFileName });
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

        await this.notifyClientAboutInvoice(saved);
        return this.getRequestDetails(saved.id);
    }

    async markPaymentReceived(id: number, operatorId = 'admin-panel') {
        const request = await this.requireRequest(id);
        request.status = 'paid';
        request.responsibleOperatorId = operatorId;
        const saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'payment_received', operatorId, 'Оператор отметил оплату');
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'service_request_payment_received',
            title: saved.serviceTypeTitle,
            description: 'Оплата по счету получена',
            serviceRequestId: saved.id,
        });
        await this.notifyClient(saved, `Оплата по заявке #${saved.id} получена. Оператор назначит время визита или свяжется с вами.`);

        return this.getRequestDetails(saved.id);
    }

    async scheduleVisit(id: number, visitAddress: string, visitTime?: string, operatorComment?: string, operatorId = 'admin-panel') {
        const request = await this.requireRequest(id);
        request.status = 'scheduled';
        request.visitAddress = visitAddress;
        request.visitTime = visitTime ? new Date(visitTime) : null;
        request.operatorComment = operatorComment ?? null;
        request.responsibleOperatorId = operatorId;
        const saved = await this.serviceRequestsRepo.save(request);

        await this.addEvent(saved, 'visit_scheduled', operatorId, 'Назначен визит', { visitAddress, visitTime, operatorComment });
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

        const timeText = saved.visitTime ? ` Время: ${saved.visitTime.toLocaleString('ru-RU')}.` : '';
        const commentText = saved.operatorComment ? ` ${saved.operatorComment}` : '';
        await this.notifyClient(saved, `По заявке #${saved.id}: приходите по адресу ${visitAddress}.${timeText}${commentText}`);

        return this.getRequestDetails(saved.id);
    }

    async complete(id: number, operatorId = 'admin-panel') {
        return this.setFinalStatus(id, 'completed', operatorId);
    }

    async cancel(id: number, operatorId = 'admin-panel') {
        return this.setFinalStatus(id, 'cancelled', operatorId);
    }

    async updateOperatorState(id: number, input: ServiceRequestOperatorStateInput, operatorId = 'admin-panel') {
        const request = await this.requireRequest(id);

        if (input.priority !== undefined) {
            request.priority = this.normalizePriority(input.priority);
        }
        request.responsibleOperatorId = operatorId;
        if (input.executorName !== undefined) {
            request.executorName = input.executorName?.trim() || null;
        }
        if (input.operatorComment !== undefined) {
            request.operatorComment = input.operatorComment?.trim() || null;
        }

        const saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, 'operator_state_updated', operatorId, 'Оператор обновил рабочие поля заявки', {
            priority: saved.priority,
            responsibleOperatorId: saved.responsibleOperatorId,
            executorName: saved.executorName,
            operatorComment: saved.operatorComment,
        });

        return this.getRequestDetails(saved.id);
    }

    present(request: ServiceRequestEntity) {
        return {
            request,
            nextStep: this.getCurrentStep(request),
            isReadyForConfirmation: !this.getCurrentStep(request) && request.status === 'draft',
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
        let serviceType = await this.serviceTypesRepo.findOne({ where: { code: 'atol_consent' } });
        if (!serviceType) {
            serviceType = await this.serviceTypesRepo.save(this.serviceTypesRepo.create({
                code: 'atol_consent',
                title: 'Согласие на доступ АТОЛ',
                description: 'Подписанное согласие клиента на дистанционный доступ и управление ККТ через кабинет АТОЛ.',
                flow: 'simple',
                isActive: false,
                settings: null,
            }));
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

    private getCurrentAtolConsentStep(request: ServiceRequestEntity) {
        const steps = [
            { key: 'city', label: 'Укажите город. Если город Красноярск, просто напишите: Красноярск' },
            { key: 'clientName', label: 'Укажите полное название организации или ИП, как в документах' },
            { key: 'inn', label: 'Укажите ИНН' },
            { key: 'representativeName', label: 'В лице кого составляется согласие? Например: Иванова Ивана Ивановича' },
            { key: 'representativeBasis', label: 'На основании чего действует представитель? Например: Устава, свидетельства ОГРНИП, доверенности' },
        ];
        return steps[request.currentStep] ?? null;
    }

    private async getClientRequest(identity: ServiceRequestIdentity, id: number) {
        await this.organizationsService.assertUserOrganization(identity.chatId, identity.platform, identity.organizationId);
        const request = await this.requireRequest(id);
        if (request.chatId !== identity.chatId || request.platform !== identity.platform) {
            throw new NotFoundException('Service request was not found');
        }

        return request;
    }

    private async requireRequest(id: number) {
        const request = await this.serviceRequestsRepo.findOne({ where: { id } });
        if (!request) {
            throw new NotFoundException('Service request was not found');
        }

        return request;
    }

    private normalizePriority(priority: ServiceRequestPriority) {
        const allowed: ServiceRequestPriority[] = ['low', 'normal', 'high', 'urgent'];
        if (!allowed.includes(priority)) {
            throw new BadRequestException('Invalid service request priority');
        }

        return priority;
    }

    private getCurrentStep(request: ServiceRequestEntity) {
        const flow = request.serviceTypeCode === 'fn_replacement' ? 'fn_replacement' : 'simple';
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

        const serviceType = await this.serviceTypesRepo.findOne({ where: { id: request.serviceTypeId } });
        const prices = serviceType?.settings?.prices as Record<string, number> | undefined;
        const term = String(request.answers?.fiscalDriveTerm ?? '');
        return prices?.[term] ?? null;
    }

    private requiresClientConfirmation(request: ServiceRequestEntity) {
        return request.serviceTypeCode === 'fn_replacement';
    }

    private async notifyOperators(request: ServiceRequestEntity) {
        const message = this.formatOperatorMessage(request);
        await this.adminNotificationsService.notify('serviceRequests', message);
    }

    private async notifyClient(request: ServiceRequestEntity, message: string) {
        if (request.platform === 'web') {
            return;
        }

        await this.messengerService.sendMessage(request.chatId, message, { platform: request.platform });
    }

    private async notifyClientAboutInvoice(request: ServiceRequestEntity) {
        if (request.platform === 'web') {
            return;
        }

        const message = `Счет по заявке #${request.id} готов. Статус заявки: ожидает оплаты.`;
        if (request.invoiceFileId && fs.existsSync(request.invoiceFileId)) {
            await this.messengerService.sendMessage(request.chatId, message, { platform: request.platform });
            await this.messengerService.sendDocument(
                request.chatId,
                {
                    source: fs.createReadStream(request.invoiceFileId),
                    filename: request.invoiceFileName || `invoice_${request.id}.pdf`,
                },
                { platform: request.platform },
            );
            return;
        }

        await this.messengerService.sendMessage(
            request.chatId,
            `${message} Счет: ${request.invoiceFileName || request.invoiceFileId}.`,
            { platform: request.platform },
        );
    }

    private formatOperatorMessage(request: ServiceRequestEntity) {
        const answerLines = Object.entries(request.answers || {})
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join('\n') || 'No answers';
        const priceLine = request.calculatedPrice ? `\nPrice: ${request.calculatedPrice} RUB` : '';

        return `New service request #${request.id}: ${request.serviceTypeTitle}\n\n` +
            `${answerLines}${priceLine}\n\n` +
            `Open the admin panel to process it.`;
    }

    private async addEvent(request: ServiceRequestEntity, type: string, actor: string, message?: string, payload?: Record<string, unknown>) {
        await this.eventsRepo.save(this.eventsRepo.create({
            serviceRequestId: request.id,
            type,
            actor,
            message: message ?? null,
            payload: payload ?? null,
        }));
    }

    private async setFinalStatus(id: number, status: 'completed' | 'cancelled', operatorId: string) {
        const request = await this.requireRequest(id);
        request.status = status;
        request.responsibleOperatorId = operatorId;
        const saved = await this.serviceRequestsRepo.save(request);
        await this.addEvent(saved, status, operatorId, status === 'completed' ? 'Заявка завершена' : 'Заявка отменена');
        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: status === 'completed' ? 'service_request_completed' : 'service_request_cancelled',
            title: saved.serviceTypeTitle,
            description: status === 'completed' ? 'Заявка завершена' : 'Заявка отменена',
            serviceRequestId: saved.id,
        });

        return this.getRequestDetails(saved.id);
    }
}
