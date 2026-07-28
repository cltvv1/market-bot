import type { DataSource } from 'typeorm';
import testDataSource from '../src/database/test-data-source';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import { CustomerActivityService } from '../src/customer-activity/customer-activity.service';
import { CustomerActivityEntity } from '../src/customer-activity/entities/customer-activity.entity';
import type { MessengerService } from '../src/messenger/messenger.types';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { PdfGeneratorService } from '../src/pdf/pdf.service';
import { RegistrationFieldEntity } from '../src/registrations/entities/registration-field.entity';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { RegistrationsService } from '../src/registrations/registrations.service';
import { ServiceRequestEventEntity } from '../src/service-requests/entities/service-request-event.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { ServiceTypeEntity } from '../src/service-requests/entities/service-type.entity';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { TicketMessageEntity } from '../src/tickets/entities/ticket-message.entity';
import { TicketEntity } from '../src/tickets/entities/ticket.entity';
import { TicketsService } from '../src/tickets/tickets.service';
import { UserChannelEntity } from '../src/users/entities/user-channel.entity';
import { UserEntity } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';

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
            .mockResolvedValue('virtual/registration.pdf'),
        generateAtolConsentPdf: jest
            .fn()
            .mockResolvedValue('virtual/atol-consent.pdf'),
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

        usersService = new UsersService(
            dataSource.getRepository(UserEntity),
            dataSource.getRepository(UserChannelEntity),
        );
        const organizationsService = new OrganizationsService(
            dataSource.getRepository(OrganizationEntity),
            dataSource.getRepository(OrganizationMemberEntity),
            usersService,
        );
        const activityService = new CustomerActivityService(
            dataSource.getRepository(CustomerActivityEntity),
        );

        registrationsService = new RegistrationsService(
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(RegistrationFieldEntity),
            pdf as unknown as PdfGeneratorService,
            usersService,
            notifications as unknown as AdminNotificationsService,
        );
        ticketsService = new TicketsService(
            dataSource.getRepository(TicketEntity),
            dataSource.getRepository(TicketMessageEntity),
            usersService,
            messenger,
            notifications as unknown as AdminNotificationsService,
        );
        serviceRequestsService = new ServiceRequestsService(
            dataSource.getRepository(ServiceTypeEntity),
            dataSource.getRepository(ServiceRequestEntity),
            dataSource.getRepository(ServiceRequestEventEntity),
            usersService,
            organizationsService,
            activityService,
            notifications as unknown as AdminNotificationsService,
            pdf as unknown as PdfGeneratorService,
            messenger,
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

        const pdfPath = await registrationsService.finishReg(withPhone!);
        const persisted = await dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: created.id });

        expect(pdfPath).toBe('virtual/registration.pdf');
        expect(persisted).toMatchObject({
            isFilled: true,
            pdfPath: 'virtual/registration.pdf',
            orgName: 'ООО Тест',
        });
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
    });

    it('keeps FN price confirmation and invoice/payment/visit transitions', async () => {
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

        const invoiced = await serviceRequestsService.attachInvoice(
            started.request.id,
            'virtual/invoice.pdf',
            'invoice.pdf',
            'operator-1',
        );
        expect(invoiced.request.status).toBe('waiting_payment');

        const paid = await serviceRequestsService.markPaymentReceived(
            started.request.id,
            'operator-1',
        );
        expect(paid.request.status).toBe('paid');

        const scheduled = await serviceRequestsService.scheduleVisit(
            started.request.id,
            'Красноярск, ул. Тестовая, 1',
            '2026-08-01T10:00:00.000Z',
            'Позвонить заранее',
            'operator-1',
        );
        expect(scheduled.request.status).toBe('scheduled');

        const completed = await serviceRequestsService.complete(
            started.request.id,
            'operator-1',
        );
        expect(completed.request.status).toBe('completed');
        expect(completed.events.map((event) => event.type)).toEqual(
            expect.arrayContaining([
                'created',
                'answered',
                'price_confirmed',
                'invoice_attached',
                'payment_received',
                'visit_scheduled',
                'completed',
            ]),
        );
        expect(messenger.sendMessage.mock.calls).toHaveLength(0);
    });

    it('captures the ATOL consent answers and generated PDF reference', async () => {
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
            generatedPdfPath: 'virtual/atol-consent.pdf',
        });
        expect(pdf.generateAtolConsentPdf).toHaveBeenCalledTimes(1);
        expect(messenger.sendMessage.mock.calls).toHaveLength(0);
    });
});
