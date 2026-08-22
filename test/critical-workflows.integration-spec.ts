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
        );
        ticketsService = new TicketsService(
            dataSource.getRepository(TicketEntity),
            dataSource.getRepository(TicketMessageEntity),
            usersService,
            messenger,
            notifications as unknown as AdminNotificationsService,
            files as unknown as FilesService,
        );
        const channelWorkflow = new ServiceRequestChannelWorkflowService(
            dataSource.getRepository(ServiceTypeEntity),
            dataSource.getRepository(ServiceRequestEntity),
            dataSource.getRepository(ServiceRequestEventEntity),
            usersService,
            organizationsService,
            activityService,
            notifications as unknown as AdminNotificationsService,
            pdf as unknown as PdfGeneratorService,
            messenger,
            files as unknown as FilesService,
            formService,
            dataSource.getRepository(ServiceRequestAttachmentEntity),
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
            messenger,
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
        const operator = await dataSource.getRepository(AdminUserEntity).save({
            login: 'workflow-operator',
            displayName: 'Workflow operator',
            passwordHash: 'test-only',
        });
        const started = await serviceRequestsService.start(
            testIdentity,
            'fn_replacement',
        );
        for (const answer of [
            '2460000000',
            'ККТ-0001',
            '15',
            '+7 999 222-33-44',
        ]) {
            await serviceRequestsService.answer(
                testIdentity,
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
            testIdentity,
            started.request.id,
        );
        expect(confirmed.request.status).toBe('invoice_required');
        await serviceRequestsService.confirmPrice(
            testIdentity,
            started.request.id,
        );
        expect(notifications.notify).toHaveBeenCalledTimes(1);

        const invoice = await files.saveBuffer({
            purpose: 'invoice',
            buffer: Buffer.from('%PDF-invoice'),
            originalName: 'invoice.pdf',
            mimeType: 'application/pdf',
        });
        const invoiced = await serviceRequestsService.attachInvoice(
            started.request.id,
            invoice.id,
            operator.id,
        );
        expect(invoiced.request.status).toBe('waiting_payment');

        await expect(
            serviceRequestsService.transitionByStaff(
                operator.id,
                started.request.id,
                'paid',
            ),
        ).rejects.toThrow('Payment proof must be attached');

        // prettier-ignore
        const paymentProof =
            await serviceRequestsService.attachPaymentProof(testIdentity, {
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
});
