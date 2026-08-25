/* eslint-disable @typescript-eslint/unbound-method */
import type { DataSource } from 'typeorm';
import testDataSource from '../src/database/test-data-source';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import { CashRegisterEntity } from '../src/assets/entities/cash-register.entity';
import { CustomerActivityService } from '../src/customer-activity/customer-activity.service';
import { CustomerActivityEntity } from '../src/customer-activity/entities/customer-activity.entity';
import type { MessengerService } from '../src/messenger/messenger.types';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { PdfGeneratorService } from '../src/pdf/pdf.service';
import { RegistrationFieldEntity } from '../src/registrations/entities/registration-field.entity';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { RegistrationReadinessService } from '../src/registrations/registration-readiness.service';
import { RegistrationsService } from '../src/registrations/registrations.service';
import { ServiceFormDefinitionEntity } from '../src/service-requests/entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from '../src/service-requests/entities/service-form-version.entity';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';
import { ServiceRequestEventEntity } from '../src/service-requests/entities/service-request-event.entity';
import { ServiceRequestMessageEntity } from '../src/service-requests/entities/service-request-message.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { ServiceTypeEntity } from '../src/service-requests/entities/service-type.entity';
import { ServiceFormService } from '../src/service-requests/service-form.service';
import { ServiceRequestChannelWorkflowService } from '../src/service-requests/service-request-channel-workflow.service';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { TicketMessageEntity } from '../src/tickets/entities/ticket-message.entity';
import { TicketEntity } from '../src/tickets/entities/ticket.entity';
import { TicketsService } from '../src/tickets/tickets.service';
import { UserChannelEntity } from '../src/users/entities/user-channel.entity';
import { UserEntity } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FilesService } from '../src/files/files.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { InboundCommandEntity } from '../src/inbound-commands/entities/inbound-command.entity';
import { InboundCommandsService } from '../src/inbound-commands/inbound-commands.service';
import { UserDialogStateEntity } from '../src/userContext/entities/user-dialog-state.entity';
import { UserContextService } from '../src/userContext/user-context.service';
import { StaleServiceRequestChannelCommandException } from '../src/service-requests/service-request-channel-workflow.service';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { OutboundDeliveriesService } from '../src/outbound-deliveries/outbound-deliveries.service';

const testIdentity = {
    platform: 'web' as const,
    chatId: 'web-characterization-client',
    name: 'Тестовый клиент',
};

describe('critical workflow characterization on migrated PostgreSQL', () => {
    let dataSource: DataSource;
    let usersService: UsersService;
    let registrationsService: RegistrationsService;
    let ticketsService: TicketsService;
    let serviceRequestsService: ServiceRequestsService;
    let channelWorkflow: ServiceRequestChannelWorkflowService;
    let inboundCommands: InboundCommandsService;
    let userContext: UserContextService;
    let outbound: OutboundDeliveriesService;
    let storedFileSequence = 0;

    const messenger: jest.Mocked<MessengerService> = {
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sendImage: jest.fn().mockResolvedValue(undefined),
        sendDocument: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
        notify: jest.fn().mockResolvedValue(undefined),
        notifyDocument: jest.fn().mockResolvedValue(undefined),
    };
    const pdf = {
        generateRegistrationPdf: jest
            .fn()
            .mockResolvedValue(Buffer.from('%PDF-registration')),
        generateAtolConsentPdf: jest
            .fn()
            .mockResolvedValue(Buffer.from('%PDF-atol-consent')),
    };
    const saveStoredFile = jest.fn(
        (_input: {
            purpose: string;
            buffer: Buffer;
            originalName?: string;
            mimeType?: string;
            metadata?: Record<string, unknown>;
        }): Promise<{ id: number }> =>
            Promise.reject(new Error(`not configured: ${_input.purpose}`)),
    );
    const files = {
        saveBuffer: saveStoredFile,
        logicalDelete: jest.fn().mockResolvedValue(undefined),
    };
    const readiness = {
        initialize: jest.fn().mockResolvedValue(undefined),
        details: jest.fn(),
        handoff: jest.fn(),
    };

    beforeAll(async () => {
        dataSource = testDataSource;
        await dataSource.initialize();
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> 'typeorm_migrations'
       ORDER BY table_name`,
        );
        const quotedTables = tables
            .map(
                ({ table_name }) =>
                    `"public"."${table_name.replaceAll('"', '""')}"`,
            )
            .join(', ');
        await dataSource.query(
            `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
        );

        jest.clearAllMocks();
        storedFileSequence = 0;
        saveStoredFile.mockImplementation((input) =>
            dataSource.getRepository(StoredFileEntity).save({
                provider: 'local',
                objectKey: `characterization/${++storedFileSequence}/file.pdf`,
                originalName: input.originalName ?? 'document.pdf',
                mimeType: input.mimeType ?? 'application/pdf',
                sizeBytes: String(input.buffer.length),
                sha256: 'a'.repeat(64),
                status: 'active',
                metadata: input.metadata ?? null,
            }),
        );

        usersService = new UsersService(
            dataSource.getRepository(UserEntity),
            dataSource.getRepository(UserChannelEntity),
        );
        inboundCommands = new InboundCommandsService(
            dataSource.getRepository(InboundCommandEntity),
            dataSource,
            usersService,
        );
        userContext = new UserContextService(
            dataSource.getRepository(UserDialogStateEntity),
        );
        outbound = new OutboundDeliveriesService(
            dataSource.getRepository(OutboundDeliveryEntity),
            dataSource,
        );
        const organizationsService = new OrganizationsService(
            dataSource.getRepository(OrganizationEntity),
            dataSource.getRepository(OrganizationMemberEntity),
            usersService,
            new AuditService(dataSource.getRepository(AuditEventEntity)),
        );
        const auditService = new AuditService(
            dataSource.getRepository(AuditEventEntity),
        );
        const activityService = new CustomerActivityService(
            dataSource.getRepository(CustomerActivityEntity),
        );
        const formService = new ServiceFormService(
            dataSource.getRepository(ServiceFormDefinitionEntity),
            dataSource.getRepository(ServiceFormVersionEntity),
        );
        readiness.details.mockImplementation(
            async (registrationId: number) => ({
                registration: await dataSource
                    .getRepository(RegistrationRequestEntity)
                    .findOneByOrFail({ id: registrationId }),
                requirements: [],
                evidence: [],
                dataRequests: [],
            }),
        );

        registrationsService = new RegistrationsService(
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(RegistrationFieldEntity),
            pdf as unknown as PdfGeneratorService,
            usersService,
            notifications as unknown as AdminNotificationsService,
            files as unknown as FilesService,
            readiness as unknown as RegistrationReadinessService,
            dataSource,
        );
        ticketsService = new TicketsService(
            dataSource.getRepository(TicketEntity),
            dataSource.getRepository(TicketMessageEntity),
            usersService,
            notifications as unknown as AdminNotificationsService,
            files as unknown as FilesService,
            dataSource,
            outbound,
        );
        channelWorkflow = new ServiceRequestChannelWorkflowService(
            dataSource.getRepository(ServiceTypeEntity),
            dataSource.getRepository(ServiceRequestEntity),
            dataSource.getRepository(ServiceRequestEventEntity),
            usersService,
            organizationsService,
            activityService,
            notifications as unknown as AdminNotificationsService,
            pdf as unknown as PdfGeneratorService,
            outbound,
            files as unknown as FilesService,
            formService,
            dataSource.getRepository(ServiceRequestAttachmentEntity),
            dataSource,
        );
        serviceRequestsService = new ServiceRequestsService(
            dataSource.getRepository(ServiceTypeEntity),
            dataSource.getRepository(ServiceRequestEntity),
            dataSource.getRepository(ServiceRequestEventEntity),
            dataSource.getRepository(ServiceRequestAttachmentEntity),
            dataSource.getRepository(ServiceRequestMessageEntity),
            dataSource.getRepository(CashRegisterEntity),
            formService,
            organizationsService,
            files as unknown as FilesService,
            auditService,
            notifications as unknown as AdminNotificationsService,
            dataSource,
            outbound,
            channelWorkflow,
        );
    });

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    });

    it('stores registration answers and completes the registration record', async () => {
        await dataSource.getRepository(RegistrationFieldEntity).save([
            { name: 'orgName', label: 'Организация', step: 2 },
            { name: 'phone', label: 'Телефон', step: 3 },
        ]);

        const created = await registrationsService.createRegistration(
            testIdentity.chatId,
            testIdentity.platform,
        );
        expect(created.currentStep).toBe(2);

        const withOrganization = await registrationsService.saveFieldValue(
            testIdentity.chatId,
            'ООО Тест',
            testIdentity.platform,
        );
        expect(withOrganization).toMatchObject({
            orgName: 'ООО Тест',
            currentStep: 3,
        });

        const withPhone = await registrationsService.saveFieldValue(
            testIdentity.chatId,
            '+7 999 000-00-00',
            testIdentity.platform,
        );
        expect(withPhone).toMatchObject({
            phone: '+7 999 000-00-00',
            currentStep: 4,
        });
        expect(await registrationsService.isCompleted(withPhone!)).toBe(true);

        const generatedPdf = await registrationsService.finishReg(withPhone!);
        const persisted = await dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: created.id });

        expect(generatedPdf).toEqual(Buffer.from('%PDF-registration'));
        expect(persisted).toMatchObject({
            status: 'new',
            orgName: 'ООО Тест',
        });
        expect(typeof persisted.pdfFileId).toBe('number');
        expect(files.saveBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                purpose: 'generated-pdf',
                buffer: Buffer.from('%PDF-registration'),
                metadata: {
                    registrationId: created.id,
                    draft: true,
                    final: false,
                },
            }),
        );
        expect(pdf.generateRegistrationPdf).toHaveBeenCalledTimes(1);
    });

    it('creates an operator question and preserves its message history', async () => {
        const user = await usersService.getOrCreateOrUpdate(
            testIdentity.chatId,
            testIdentity.name,
            undefined,
            testIdentity.platform,
        );
        const ticket = await ticketsService.createTicket(
            testIdentity.chatId,
            undefined,
            testIdentity.name,
            'Первый вопрос',
            testIdentity.platform,
            user.id,
        );

        await ticketsService.saveTicketText(
            testIdentity.chatId,
            'Уточнение по вопросу',
            testIdentity.platform,
        );

        const messages = await ticketsService.getTicketMessages(ticket.id);
        expect(messages.map((message) => message.text)).toEqual([
            'Первый вопрос',
            'Уточнение по вопросу',
        ]);
        expect(messages.every((message) => message.sender === 'user')).toBe(
            true,
        );
    });

    it('reuses an untouched FN draft and hides it from admin work', async () => {
        const first = await serviceRequestsService.start(
            testIdentity,
            'fn_replacement',
        );
        const second = await serviceRequestsService.start(
            testIdentity,
            'fn_replacement',
        );

        expect(second.request.id).toBe(first.request.id);
        expect(
            await dataSource
                .getRepository(ServiceRequestEntity)
                .countBy({ serviceTypeCode: 'fn_replacement' }),
        ).toBe(1);
        expect(
            await dataSource
                .getRepository(ServiceRequestEventEntity)
                .countBy({ serviceRequestId: first.request.id }),
        ).toBe(1);
        expect(await serviceRequestsService.listForAdmin('active')).toEqual([]);
        expect(await serviceRequestsService.listForAdmin('all')).toEqual([]);

        await serviceRequestsService.answer(
            testIdentity,
            first.request.id,
            '2460000000',
        );

        expect(
            (await serviceRequestsService.listForAdmin('active')).map(
                (request) => request.id,
            ),
        ).toEqual([first.request.id]);
    });

    it('submits a simple service request without external delivery', async () => {
        const started = await serviceRequestsService.start(
            testIdentity,
            'kkt_remote_work',
        );
        await serviceRequestsService.answer(
            testIdentity,
            started.request.id,
            'Настроить кассовую программу',
        );
        const submitted = await serviceRequestsService.answer(
            testIdentity,
            started.request.id,
            '+7 999 111-22-33',
        );

        expect(submitted.request.status).toBe('invoice_required');
        expect(submitted.request.answers).toEqual({
            problemDescription: 'Настроить кассовую программу',
            contactForCall: '+7 999 111-22-33',
        });
        expect(notifications.notify).toHaveBeenCalledTimes(1);
        expect(messenger.sendMessage.mock.calls).toHaveLength(0);
        expect(
            (await serviceRequestsService.listForAdmin('active')).map(
                (request) => request.id,
            ),
        ).toContain(started.request.id);
    });

    it.each(['telegram', 'max'] as const)(
        'creates a canonical service request for %s',
        async (platform) => {
            const identity = {
                platform,
                chatId: `${platform}-canonical-client`,
                name: `${platform} client`,
            };
            const started = await serviceRequestsService.start(
                identity,
                'kkt_remote_work',
            );
            const persisted = await dataSource
                .getRepository(ServiceRequestEntity)
                .findOneByOrFail({ id: started.request.id });

            expect(persisted).toMatchObject({
                platform,
                source: platform,
                status: 'draft',
                customerStatus: 'received',
                chatId: identity.chatId,
            });
            expect(persisted.formVersionId).toEqual(expect.any(Number));
            expect(persisted.requestNumber).toMatch(/^SR-\d{8}-[A-F0-9]{8}$/);
            expect(messenger.sendMessage.mock.calls).toHaveLength(0);
        },
    );

    it('keeps FN price confirmation and invoice/payment/visit transitions', async () => {
        const requestIdentity = {
            ...testIdentity,
            platform: 'telegram' as const,
            chatId: 'invoice-characterization-client',
        };
        const operator = await dataSource.getRepository(AdminUserEntity).save({
            login: 'workflow-operator',
            displayName: 'Workflow operator',
            passwordHash: 'test-only',
        });
        const started = await serviceRequestsService.start(
            requestIdentity,
            'fn_replacement',
        );
        for (const answer of [
            '2460000000',
            'ККТ-0001',
            '15',
            '+7 999 222-33-44',
        ]) {
            await serviceRequestsService.answer(
                requestIdentity,
                started.request.id,
                answer,
            );
        }

        const ready = await serviceRequestsService.getRequest(
            started.request.id,
        );
        expect(ready).toMatchObject({
            status: 'draft',
            calculatedPrice: 15900,
        });

        const confirmed = await serviceRequestsService.confirmPrice(
            requestIdentity,
            started.request.id,
        );
        expect(confirmed.request.status).toBe('invoice_required');
        await serviceRequestsService.confirmPrice(
            requestIdentity,
            started.request.id,
        );
        expect(notifications.notify).toHaveBeenCalledTimes(1);

        const invoice = await files.saveBuffer({
            purpose: 'invoice',
            buffer: Buffer.from('%PDF-invoice'),
            originalName: 'invoice.pdf',
            mimeType: 'application/pdf',
        });
        jest.spyOn(outbound, 'enqueue').mockRejectedValueOnce(
            new Error('forced enqueue rollback'),
        );
        await expect(
            serviceRequestsService.attachInvoice(
                started.request.id,
                invoice.id,
                operator.id,
            ),
        ).rejects.toThrow('forced enqueue rollback');
        const rolledBack = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: started.request.id });
        expect(rolledBack.invoiceStoredFileId).toBeNull();
        expect(rolledBack.status).toBe('invoice_required');

        messenger.sendDocument.mockClear();
        const invoiced = await serviceRequestsService.attachInvoice(
            started.request.id,
            invoice.id,
            operator.id,
        );
        expect(invoiced.request.status).toBe('waiting_payment');
        const invoiceDeliveries = await dataSource
            .getRepository(OutboundDeliveryEntity)
            .findBy({
                sourceType: 'service_request',
                sourceId: String(started.request.id),
            });
        expect(invoiceDeliveries).toEqual([
            expect.objectContaining({
                kind: 'document',
                status: 'pending',
                storedFileId: invoice.id,
            }),
        ]);
        expect(messenger.sendDocument).not.toHaveBeenCalled();

        const messagesBeforeStaffReply = await dataSource
            .getRepository(ServiceRequestMessageEntity)
            .countBy({ serviceRequestId: started.request.id });
        jest.spyOn(outbound, 'enqueue').mockRejectedValueOnce(
            new Error('forced customer enqueue rollback'),
        );
        await expect(
            serviceRequestsService.addStaffMessage(
                operator.id,
                started.request.id,
                'Проверяем доставку',
                'customer',
            ),
        ).rejects.toThrow('forced customer enqueue rollback');
        expect(
            await dataSource
                .getRepository(ServiceRequestMessageEntity)
                .countBy({ serviceRequestId: started.request.id }),
        ).toBe(messagesBeforeStaffReply);

        const staffMessage = await serviceRequestsService.addStaffMessage(
            operator.id,
            started.request.id,
            'Проверяем доставку',
            'customer',
        );
        expect(
            await dataSource
                .getRepository(OutboundDeliveryEntity)
                .findOneByOrFail({
                    dedupeKey: `service-request-message:${staffMessage.id}:customer`,
                }),
        ).toMatchObject({ status: 'pending', audience: 'customer' });

        await expect(
            serviceRequestsService.transitionByStaff(
                operator.id,
                started.request.id,
                'paid',
            ),
        ).rejects.toThrow('Payment proof must be attached');

        // prettier-ignore
        const paymentProof =
            await serviceRequestsService.attachPaymentProof(requestIdentity, {
                buffer: Buffer.from('%PDF-1.7 payment'),
                fileName: 'payment.pdf',
                mimeType: 'application/pdf',
            });
        expect(paymentProof?.request.id).toBe(started.request.id);
        expect(paymentProof?.request.status).toBe('waiting_payment');
        expect(typeof paymentProof?.request.paymentProofFileId).toBe('number');

        const paid = await serviceRequestsService.transitionByStaff(
            operator.id,
            started.request.id,
            'paid',
        );
        expect(paid.request.status).toBe('paid');

        const scheduled = await serviceRequestsService.scheduleVisit(
            started.request.id,
            'Красноярск, ул. Тестовая, 1',
            '2026-08-01T10:00:00.000Z',
            'Позвонить заранее',
            operator.id,
        );
        expect(scheduled.request.status).toBe('scheduled');

        const completed = await serviceRequestsService.transitionByStaff(
            operator.id,
            started.request.id,
            'completed',
        );
        expect(completed.request.status).toBe('completed');
        expect(completed.events.map((event) => event.type)).toEqual(
            expect.arrayContaining([
                'created',
                'answered',
                'price_confirmed',
                'invoice_attached',
                'payment_proof_attached',
                'status_changed',
                'visit_scheduled',
            ]),
        );
        expect(messenger.sendMessage.mock.calls).toHaveLength(0);
    });

    it('stores the generated ATOL consent PDF through FileStorage', async () => {
        const started =
            await serviceRequestsService.startAtolConsent(testIdentity);
        for (const answer of [
            'Красноярск',
            'ООО Тест',
            '2460000000',
            'Иванова Ивана Ивановича',
            'Устава',
        ]) {
            await serviceRequestsService.answerAtolConsent(
                testIdentity,
                answer,
            );
        }

        const persisted = await serviceRequestsService.getRequest(
            started.request.id,
        );
        expect(persisted?.status).toBe('draft');
        expect(persisted?.answers).toMatchObject({
            city: 'Красноярск',
            clientName: 'ООО Тест',
            inn: '2460000000',
            representativeName: 'Иванова Ивана Ивановича',
            representativeBasis: 'Устава',
        });
        expect(typeof persisted?.generatedConsentFileId).toBe('number');
        expect(files.saveBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                purpose: 'atol-consent',
                metadata: { serviceRequestId: started.request.id },
            }),
        );
        expect(Buffer.isBuffer(saveStoredFile.mock.calls[0][0].buffer)).toBe(
            true,
        );
        expect(saveStoredFile.mock.calls[0][0].buffer).toEqual(
            Buffer.from('%PDF-atol-consent'),
        );
        expect(pdf.generateAtolConsentPdf).toHaveBeenCalledTimes(1);
        expect(messenger.sendMessage.mock.calls).toHaveLength(0);
    });

    it('does not persist a generated consent reference when storage fails', async () => {
        files.saveBuffer.mockRejectedValueOnce(
            new Error('storage unavailable'),
        );
        await serviceRequestsService.startAtolConsent(testIdentity);

        for (const answer of [
            'City',
            'Client',
            '2460000000',
            'Person',
            'Basis',
        ]) {
            if (answer === 'Basis') {
                await expect(
                    serviceRequestsService.answerAtolConsent(
                        testIdentity,
                        answer,
                    ),
                ).rejects.toThrow('storage unavailable');
            } else {
                await serviceRequestsService.answerAtolConsent(
                    testIdentity,
                    answer,
                );
            }
        }

        const request = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({
                chatId: testIdentity.chatId,
                serviceTypeCode: 'atol_consent',
            });
        expect(request.generatedConsentFileId).toBeNull();
        expect(
            await dataSource
                .getRepository(ServiceRequestAttachmentEntity)
                .countBy({ serviceRequestId: request.id }),
        ).toBe(0);
    });

    it('logically deletes the generated consent file when a draft is cancelled', async () => {
        await serviceRequestsService.startAtolConsent(testIdentity);
        for (const answer of [
            'City',
            'Client',
            '2460000000',
            'Person',
            'Basis',
        ]) {
            await serviceRequestsService.answerAtolConsent(
                testIdentity,
                answer,
            );
        }

        const generated = await serviceRequestsService.getLatestDraftForClient(
            testIdentity,
            ['atol_consent'],
        );
        await serviceRequestsService.cancelAtolConsentDraft(testIdentity);

        expect(files.logicalDelete).toHaveBeenCalledWith(
            generated?.generatedConsentFileId,
        );
    });

    it('processes the same inbound provider update exactly once', async () => {
        let executions = 0;
        const input = {
            platform: 'telegram' as const,
            externalUpdateId: 'update:durable-duplicate-1',
            chatId: 'durable-duplicate-client',
            commandType: 'telegram.message',
            payload: { kind: 'text' },
        };

        const [first, second] = await Promise.all([
            inboundCommands.execute(input, async () => {
                executions += 1;
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                return { applied: true };
            }),
            inboundCommands.execute(input, () => {
                executions += 1;
                return Promise.resolve({ applied: true });
            }),
        ]);

        expect(executions).toBe(1);
        expect([first.status, second.status].sort()).toEqual([
            'duplicate',
            'processed',
        ]);
        expect(
            await dataSource.getRepository(InboundCommandEntity).countBy({
                platform: 'telegram',
                externalUpdateId: input.externalUpdateId,
            }),
        ).toBe(1);
    });

    it('fails closed when an interrupted command may already have mutated a registration', async () => {
        await dataSource.getRepository(RegistrationFieldEntity).save([
            { name: 'orgName', label: 'Организация', step: 2 },
            { name: 'phone', label: 'Телефон', step: 3 },
        ]);
        const chatId = 'interrupted-registration-client';
        const registration = await registrationsService.createRegistration(
            chatId,
            'telegram',
        );
        await registrationsService.saveFieldValue(
            chatId,
            'ООО После первой попытки',
            'telegram',
        );

        const input = {
            platform: 'telegram' as const,
            externalUpdateId: 'update:interrupted-registration-answer-1',
            chatId,
            commandType: 'telegram.registration.answer',
            payload: { kind: 'text' },
        };
        await dataSource.getRepository(InboundCommandEntity).save({
            ...input,
            userId: null,
            status: 'processing',
            attemptCount: 1,
            processingStartedAt: new Date(),
            processedAt: null,
            error: null,
            resultMetadata: null,
        });

        let handlerInvocations = 0;
        const replayHandler = async () => {
            handlerInvocations += 1;
            return registrationsService.saveFieldValue(
                chatId,
                '+7 999 000-00-00',
                'telegram',
            );
        };

        const firstReplay = await inboundCommands.execute(input, replayHandler);
        const secondReplay = await inboundCommands.execute(
            input,
            replayHandler,
        );

        expect(firstReplay.status).toBe('failed');
        expect(secondReplay.status).toBe('failed');
        expect(handlerInvocations).toBe(0);

        const persistedRegistration = await dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: registration.id });
        expect(persistedRegistration).toMatchObject({
            orgName: 'ООО После первой попытки',
            phone: null,
            currentStep: 3,
        });

        const persistedCommand = await dataSource
            .getRepository(InboundCommandEntity)
            .findOneByOrFail({
                platform: input.platform,
                externalUpdateId: input.externalUpdateId,
            });
        expect(persistedCommand).toMatchObject({
            status: 'failed',
            attemptCount: 1,
            processedAt: null,
            resultMetadata: {
                interrupted: true,
                automaticReplay: false,
            },
        });
        expect(persistedCommand.error).toContain(
            'Interrupted or indeterminate execution',
        );
    });

    it('moves an orphaned processing command to terminal failure without invoking its handler', async () => {
        const input = {
            platform: 'max' as const,
            externalUpdateId: 'message:interrupted-lifecycle-1',
            chatId: 'interrupted-lifecycle-client',
            commandType: 'max.ticket.message',
            payload: { kind: 'text' },
        };
        const processingStartedAt = new Date('2026-08-24T10:00:00.000Z');
        const command = await dataSource
            .getRepository(InboundCommandEntity)
            .save({
                ...input,
                userId: null,
                status: 'processing',
                attemptCount: 1,
                processingStartedAt,
                processedAt: null,
                error: null,
                resultMetadata: null,
            });
        const handler = jest.fn().mockResolvedValue({ applied: true });

        const outcome = await inboundCommands.execute(input, handler);

        expect(outcome.status).toBe('failed');
        expect(handler).not.toHaveBeenCalled();
        const persisted = await dataSource
            .getRepository(InboundCommandEntity)
            .findOneByOrFail({ id: command.id });
        expect(persisted.status).toBe('failed');
        expect(persisted.processingStartedAt).toEqual(processingStartedAt);
        expect(persisted.attemptCount).toBe(1);

        await expect(
            inboundCommands.execute(input, handler),
        ).resolves.toMatchObject({ status: 'failed' });
        expect(handler).not.toHaveBeenCalled();
    });

    it('serializes parallel service-request answers and rejects a replayed callback state', async () => {
        const identity = {
            platform: 'telegram' as const,
            chatId: 'durable-fn-client',
            name: 'Durable FN client',
        };
        const started = await serviceRequestsService.start(
            identity,
            'fn_replacement',
        );
        await serviceRequestsService.answer(
            identity,
            started.request.id,
            '2460000000',
        );
        const choiceStep = await serviceRequestsService.answer(
            identity,
            started.request.id,
            'KKT-0001',
        );
        const expected = {
            expectedStep: choiceStep.request.currentStep,
            expectedVersion: choiceStep.request.version,
        };

        const results = await Promise.allSettled([
            serviceRequestsService.answer(
                identity,
                started.request.id,
                '15',
                expected,
            ),
            serviceRequestsService.answer(
                identity,
                started.request.id,
                '36',
                expected,
            ),
        ]);
        const fulfilled = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = results.find(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected',
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toBeDefined();
        expect(rejected?.reason).toBeInstanceOf(
            StaleServiceRequestChannelCommandException,
        );

        const afterParallel = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: started.request.id });
        expect(afterParallel.currentStep).toBe(expected.expectedStep + 1);
        expect(afterParallel.answers.fiscalDriveTerm).toMatch(/^(15|36)$/);
        expect(afterParallel.answers.contactForCall).toBeUndefined();

        const replaySnapshot = {
            currentStep: afterParallel.currentStep,
            answers: afterParallel.answers,
        };
        await expect(
            serviceRequestsService.answer(
                identity,
                started.request.id,
                '15',
                expected,
            ),
        ).rejects.toBeInstanceOf(StaleServiceRequestChannelCommandException);

        const afterReplay = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: started.request.id });
        expect(afterReplay.currentStep).toBe(replaySnapshot.currentStep);
        expect(afterReplay.answers).toEqual(replaySnapshot.answers);
    });

    it('keeps one active draft for parallel channel starts', async () => {
        const identity = {
            platform: 'max' as const,
            chatId: 'durable-start-client',
            name: 'Durable start client',
        };
        await usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            undefined,
            identity.platform,
        );

        const serviceStarts = await Promise.all([
            serviceRequestsService.start(identity, 'kkt_remote_work'),
            serviceRequestsService.start(identity, 'kkt_remote_work'),
        ]);
        expect(serviceStarts[0].request.id).toBe(serviceStarts[1].request.id);
        expect(
            await dataSource.getRepository(ServiceRequestEntity).countBy({
                platform: 'max',
                chatId: identity.chatId,
                serviceTypeCode: 'kkt_remote_work',
                status: 'draft',
            }),
        ).toBe(1);

        const registrations = await Promise.all([
            registrationsService.createRegistration(
                identity.chatId,
                identity.platform,
            ),
            registrationsService.createRegistration(
                identity.chatId,
                identity.platform,
            ),
        ]);
        expect(registrations[0].id).toBe(registrations[1].id);
        expect(
            await dataSource.getRepository(RegistrationRequestEntity).countBy({
                platform: 'max',
                chatId: identity.chatId,
                status: 'draft',
            }),
        ).toBe(1);

        const tickets = await Promise.all([
            ticketsService.getOrCreateActiveTicket({
                userChatId: identity.chatId,
                platform: identity.platform,
            }),
            ticketsService.getOrCreateActiveTicket({
                userChatId: identity.chatId,
                platform: identity.platform,
            }),
        ]);
        expect(tickets[0].ticket.id).toBe(tickets[1].ticket.id);
        expect(
            await dataSource.getRepository(TicketEntity).countBy({
                platform: 'max',
                userChatId: identity.chatId,
                isAnswered: false,
            }),
        ).toBe(1);
    });

    it('does not apply a duplicate registration answer twice', async () => {
        await dataSource.getRepository(RegistrationFieldEntity).save([
            { name: 'orgName', label: 'Организация', step: 2 },
            { name: 'phone', label: 'Телефон', step: 3 },
        ]);
        const chatId = 'durable-registration-client';
        const registration = await registrationsService.createRegistration(
            chatId,
            'telegram',
        );
        const input = {
            platform: 'telegram' as const,
            externalUpdateId: 'update:durable-registration-answer-1',
            chatId,
            commandType: 'telegram.registration.answer',
            payload: { value: 'ООО Дубликат' },
        };

        await Promise.all([
            inboundCommands.execute(input, () =>
                registrationsService.saveFieldValue(
                    chatId,
                    'ООО Дубликат',
                    'telegram',
                ),
            ),
            inboundCommands.execute(input, () =>
                registrationsService.saveFieldValue(
                    chatId,
                    'ООО Дубликат',
                    'telegram',
                ),
            ),
        ]);

        const persisted = await dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: registration.id });
        expect(persisted).toMatchObject({
            orgName: 'ООО Дубликат',
            currentStep: 3,
        });
    });

    it('recovers a persisted dialog context after a service restart', async () => {
        await userContext.set(
            'durable-context-client',
            { mode: 'SERVICE_REQUEST', serviceRequestId: 42 },
            'telegram',
        );
        const restartedContext = new UserContextService(
            dataSource.getRepository(UserDialogStateEntity),
        );

        await expect(
            restartedContext.get('durable-context-client', 'telegram'),
        ).resolves.toEqual({
            mode: 'SERVICE_REQUEST',
            talkingTo: null,
            serviceRequestId: 42,
        });
    });
});
