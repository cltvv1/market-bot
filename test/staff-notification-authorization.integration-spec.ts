import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import { AdminService } from '../src/admin/admin.service';
import { AuthorizeStaffNotifications1787750400000 } from '../src/database/migrations/1787750400000-AuthorizeStaffNotifications';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import type { AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { MESSENGER_SERVICE } from '../src/messenger/messenger.types';
import type { MessengerService } from '../src/messenger/messenger.types';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { OutboundDeliveryProcessor } from '../src/outbound-deliveries/outbound-delivery.processor';
import { OutboundDeliveriesService } from '../src/outbound-deliveries/outbound-deliveries.service';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { ServiceFormDefinitionEntity } from '../src/service-requests/entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from '../src/service-requests/entities/service-form-version.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { ServiceTypeEntity } from '../src/service-requests/entities/service-type.entity';
import { TicketEntity } from '../src/tickets/entities/ticket.entity';

describe('SEC-R2 staff notification authorization', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let adminService: AdminService;
    let notifications: AdminNotificationsService;
    let outbound: OutboundDeliveriesService;
    let processor: OutboundDeliveryProcessor;
    let messenger: MessengerService;
    let sendMessage: jest.SpiedFunction<MessengerService['sendMessage']>;
    let serviceType: ServiceTypeEntity;
    let formVersion: ServiceFormVersionEntity;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        await app.init();
        dataSource = app.get(DataSource);
        adminService = app.get(AdminService);
        notifications = app.get(AdminNotificationsService);
        outbound = app.get(OutboundDeliveriesService);
        processor = app.get(OutboundDeliveryProcessor);
        messenger = app.get(MESSENGER_SERVICE);
        sendMessage = jest
            .spyOn(messenger, 'sendMessage')
            .mockResolvedValue({ message_id: 700 });
        const telegramBot = app.get<Telegraf>(getBotToken());
        jest.spyOn(telegramBot, 'stop').mockImplementation(() => undefined);
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations'`,
        );
        const names = tables
            .map(
                ({ table_name }) =>
                    `"public"."${table_name.replaceAll('"', '""')}"`,
            )
            .join(', ');
        await dataSource.query(
            `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
        );
        sendMessage.mockClear();
        sendMessage.mockResolvedValue({ message_id: 700 });
        await seedServiceForm();
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    it('uses least-privilege defaults for newly inserted staff', async () => {
        const admin = await dataSource.getRepository(AdminUserEntity).save({
            login: 'default-preferences',
            displayName: 'Default Preferences',
            passwordHash: 'hash',
        });
        expect(admin).toMatchObject({
            notifyRegistrations: false,
            notifyTickets: false,
            notifyServiceRequests: false,
        });

        const defaults: Array<{ column_name: string; column_default: string }> =
            await dataSource.query(
                `SELECT column_name, column_default
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'admin_users'
                   AND column_name IN ('notifyRegistrations', 'notifyTickets', 'notifyServiceRequests')`,
            );
        expect(defaults).toHaveLength(3);
        expect(defaults.every((item) => item.column_default === 'false')).toBe(
            true,
        );
    });

    it('preserves existing explicit preferences while applying the migration', async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const migration = new AuthorizeStaffNotifications1787750400000();
            await migration.down(queryRunner);
            await queryRunner.query(
                `INSERT INTO "admin_users"
                    ("login", "displayName", "passwordHash", "notifyRegistrations", "notifyTickets", "notifyServiceRequests")
                 VALUES ('migration-existing', 'Migration Existing', 'hash', true, false, true)`,
            );
            await migration.up(queryRunner);
            const [stored] = (await queryRunner.query(
                `SELECT "notifyRegistrations", "notifyTickets", "notifyServiceRequests"
                 FROM "admin_users"
                 WHERE "login" = 'migration-existing'`,
            )) as Array<{
                notifyRegistrations: boolean;
                notifyTickets: boolean;
                notifyServiceRequests: boolean;
            }>;
            expect(stored).toEqual({
                notifyRegistrations: true,
                notifyTickets: false,
                notifyServiceRequests: true,
            });
        } finally {
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
        }
    });

    it('enforces permission-aware subscription settings and permits disabling legacy preferences', async () => {
        const sales = await createStaff('settings-sales', ['sales_manager']);
        for (const forbiddenPreference of [
            'notifyRegistrations',
            'notifyTickets',
            'notifyServiceRequests',
        ] as const) {
            await expect(
                adminService.updateNotificationSettings(sales.id, {
                    notifyRegistrations:
                        forbiddenPreference === 'notifyRegistrations',
                    notifyTickets: forbiddenPreference === 'notifyTickets',
                    notifyServiceRequests:
                        forbiddenPreference === 'notifyServiceRequests',
                }),
            ).rejects.toMatchObject({ status: 403 });
        }

        const engineer = await createStaff('settings-engineer', ['engineer']);
        await expect(
            adminService.updateNotificationSettings(engineer.id, {
                notifyRegistrations: true,
                notifyTickets: false,
                notifyServiceRequests: true,
            }),
        ).resolves.toMatchObject({
            notifyRegistrations: true,
            notifyTickets: false,
            notifyServiceRequests: true,
        });
        await expect(
            adminService.updateNotificationSettings(engineer.id, {
                notifyRegistrations: true,
                notifyTickets: true,
                notifyServiceRequests: true,
            }),
        ).rejects.toMatchObject({ status: 403 });

        for (const [login, roles] of [
            ['settings-operator', ['operator']],
            ['settings-superadmin', ['superadmin']],
        ] as Array<[string, AdminRole[]]>) {
            const admin = await createStaff(login, roles);
            await expect(
                adminService.updateNotificationSettings(admin.id, {
                    notifyRegistrations: true,
                    notifyTickets: true,
                    notifyServiceRequests: true,
                }),
            ).resolves.toMatchObject({
                notifyRegistrations: true,
                notifyTickets: true,
                notifyServiceRequests: true,
            });
        }

        await dataSource.getRepository(AdminUserEntity).update(sales.id, {
            notifyRegistrations: true,
            notifyTickets: true,
            notifyServiceRequests: true,
        });
        await expect(
            adminService.updateNotificationSettings(sales.id, {
                notifyRegistrations: false,
                notifyTickets: true,
                notifyServiceRequests: true,
            }),
        ).resolves.toMatchObject({
            notifyRegistrations: false,
            notifyTickets: true,
            notifyServiceRequests: true,
        });
    });

    it('fans out registrations, service requests, tickets and documents only to authorized staff', async () => {
        const operator = await createStaff('fanout-operator', ['operator'], {
            telegramChatId: 'operator-tg',
            notifyRegistrations: true,
            notifyTickets: true,
            notifyServiceRequests: true,
        });
        const superadmin = await createStaff(
            'fanout-superadmin',
            ['superadmin'],
            {
                maxChatId: 'super-max',
                notifyRegistrations: true,
                notifyTickets: true,
                notifyServiceRequests: true,
            },
        );
        const assigned = await createStaff('fanout-assigned', ['engineer'], {
            telegramChatId: 'assigned-tg',
            notifyRegistrations: true,
            notifyTickets: true,
            notifyServiceRequests: true,
        });
        await createStaff('fanout-other', ['engineer'], {
            maxChatId: 'other-max',
            notifyRegistrations: true,
            notifyTickets: true,
            notifyServiceRequests: true,
        });
        await createStaff('fanout-sales', ['sales_manager'], {
            telegramChatId: 'sales-tg',
            maxChatId: 'sales-max',
            notifyRegistrations: true,
            notifyTickets: true,
            notifyServiceRequests: true,
        });

        const registration = await createRegistration(assigned.id);
        const unassignedRegistration = await createRegistration(null);
        const request = await createServiceRequest(assigned.id);
        const unassignedRequest = await createServiceRequest(null);
        const ticket = await createTicket();

        await notifications.notify('registrations', 'Registration', {
            dedupeKey: 'sec-r2:registration:assigned',
            sourceType: 'registration',
            sourceId: registration.id,
        });
        await notifications.notify('registrations', 'Unassigned', {
            dedupeKey: 'sec-r2:registration:unassigned',
            sourceType: 'registration',
            sourceId: unassignedRegistration.id,
        });
        await notifications.notify('serviceRequests', 'Service request', {
            dedupeKey: 'sec-r2:service:assigned',
            sourceType: 'service_request',
            sourceId: request.id,
        });
        await notifications.notify('serviceRequests', 'Unassigned service', {
            dedupeKey: 'sec-r2:service:unassigned',
            sourceType: 'service_request',
            sourceId: unassignedRequest.id,
        });
        await notifications.notify('tickets', 'Ticket', {
            dedupeKey: 'sec-r2:ticket',
            sourceType: 'ticket',
            sourceId: ticket.id,
        });

        const file = await createStoredFile();
        await notifications.notifyDocument(
            'registrations',
            { storedFileId: file.id, filename: file.originalName },
            {
                dedupeKey: 'sec-r2:registration:document',
                sourceType: 'registration',
                sourceId: registration.id,
            },
        );

        await expectRecipients('sec-r2:registration:assigned', [
            operator.id,
            superadmin.id,
            assigned.id,
        ]);
        await expectRecipients('sec-r2:registration:unassigned', [
            operator.id,
            superadmin.id,
        ]);
        await expectRecipients('sec-r2:service:assigned', [
            operator.id,
            superadmin.id,
            assigned.id,
        ]);
        await expectRecipients('sec-r2:service:unassigned', [
            operator.id,
            superadmin.id,
        ]);
        await expectRecipients('sec-r2:ticket', [operator.id, superadmin.id]);
        await expectRecipients('sec-r2:registration:document:document', [
            operator.id,
            superadmin.id,
            assigned.id,
        ]);
    });

    it('uses transaction-local assignment for recipient selection and rolls intent back atomically', async () => {
        const engineer = await createStaff(
            'transaction-engineer',
            ['engineer'],
            {
                telegramChatId: 'transaction-engineer-tg',
                notifyRegistrations: true,
                notifyServiceRequests: true,
            },
        );
        const registration = await createRegistration(null);

        await dataSource.transaction(async (manager) => {
            await manager
                .getRepository(RegistrationRequestEntity)
                .update(registration.id, { assignedEngineerId: engineer.id });
            await notifications.notify('registrations', 'Assigned now', {
                dedupeKey: 'sec-r2:transaction:commit',
                sourceType: 'registration',
                sourceId: registration.id,
                manager,
            });
        });
        await expectRecipients('sec-r2:transaction:commit', [engineer.id]);

        const request = await createServiceRequest(null);
        await expect(
            dataSource.transaction(async (manager) => {
                await manager
                    .getRepository(ServiceRequestEntity)
                    .update(request.id, { assignedEngineerId: engineer.id });
                await notifications.notify('serviceRequests', 'Rolled back', {
                    dedupeKey: 'sec-r2:transaction:rollback',
                    sourceType: 'service_request',
                    sourceId: request.id,
                    manager,
                });
                throw new Error('forced rollback');
            }),
        ).rejects.toThrow('forced rollback');
        expect(
            await outbound.repository.countBy({
                dedupeKey:
                    'sec-r2:transaction:rollback:staff:' +
                    engineer.id +
                    ':telegram',
            }),
        ).toBe(0);
        expect(
            await dataSource
                .getRepository(ServiceRequestEntity)
                .findOneByOrFail({ id: request.id }),
        ).toMatchObject({ assignedEngineerId: null });
    });

    it.each([
        [
            'employee deactivation',
            async (admin: AdminUserEntity) => {
                await dataSource
                    .getRepository(AdminUserEntity)
                    .update(admin.id, { isActive: false });
            },
        ],
        [
            'role removal',
            async (admin: AdminUserEntity) => {
                await dataSource
                    .getRepository(AdminUserRoleEntity)
                    .delete({ userId: admin.id });
            },
        ],
        [
            'preference disable',
            async (admin: AdminUserEntity) => {
                await dataSource
                    .getRepository(AdminUserEntity)
                    .update(admin.id, { notifyRegistrations: false });
            },
        ],
        [
            'messenger rebinding',
            async (admin: AdminUserEntity) => {
                await dataSource
                    .getRepository(AdminUserEntity)
                    .update(admin.id, { telegramChatId: 'new-chat' });
            },
        ],
    ])(
        'fails queued staff delivery terminally after %s',
        async (_label, revoke) => {
            const engineer = await createStaff(
                'revoked-engineer',
                ['engineer'],
                {
                    telegramChatId: 'revoked-chat',
                    notifyRegistrations: true,
                },
            );
            const registration = await createRegistration(engineer.id);
            const delivery = await enqueueNotification(
                'registrations',
                'registration',
                registration.id,
                'sec-r2:revoked',
            );

            await revoke(engineer);
            await expectTerminalAuthorizationFailure(delivery.id);
        },
    );

    it('blocks queued assigned-only deliveries after registration or service-request reassignment', async () => {
        const oldEngineer = await createStaff('old-engineer', ['engineer'], {
            telegramChatId: 'old-engineer-chat',
            notifyRegistrations: true,
            notifyServiceRequests: true,
        });
        const nextEngineer = await createStaff('next-engineer', ['engineer']);
        const registration = await createRegistration(oldEngineer.id);
        const registrationDelivery = await enqueueNotification(
            'registrations',
            'registration',
            registration.id,
            'sec-r2:registration:reassigned',
        );
        await dataSource
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { assignedEngineerId: nextEngineer.id });
        await expectTerminalAuthorizationFailure(registrationDelivery.id);

        sendMessage.mockClear();
        const request = await createServiceRequest(oldEngineer.id);
        const requestDelivery = await enqueueNotification(
            'serviceRequests',
            'service_request',
            request.id,
            'sec-r2:service:reassigned',
        );
        await dataSource
            .getRepository(ServiceRequestEntity)
            .update(request.id, { assignedEngineerId: nextEngineer.id });
        await expectTerminalAuthorizationFailure(requestDelivery.id);
    });

    it('fails legacy staff rows without trusted staff identity closed', async () => {
        const ticket = await createTicket();
        const inserted = await dataSource
            .getRepository(OutboundDeliveryEntity)
            .save({
                dedupeKey: 'sec-r2:legacy-staff-row',
                platform: 'telegram',
                recipientChatId: 'legacy-chat',
                kind: 'text',
                audience: 'staff',
                recipientStaffId: null,
                sourceType: 'ticket',
                sourceId: String(ticket.id),
                payload: { text: 'Must not be delivered' },
                status: 'pending',
                attemptCount: 0,
                nextAttemptAt: new Date(),
            });

        await expectTerminalAuthorizationFailure(inserted.id);
    });

    it('sends normally when staff authorization remains current', async () => {
        const operator = await createStaff(
            'authorized-operator',
            ['operator'],
            {
                maxChatId: 'authorized-max-chat',
                notifyTickets: true,
            },
        );
        const ticket = await createTicket();
        const delivery = await enqueueNotification(
            'tickets',
            'ticket',
            ticket.id,
            'sec-r2:authorized',
        );

        await processor.processBatch(new Date());
        expect(sendMessage).toHaveBeenCalledWith(
            'authorized-max-chat',
            'SEC-R2 test',
            expect.objectContaining({ platform: 'max' }),
        );
        expect(await outbound.get(delivery.id)).toMatchObject({
            recipientStaffId: operator.id,
            status: 'sent',
            attemptCount: 1,
            lastError: null,
        });
    });

    it('treats staff identity as part of a deduplicated delivery intent', async () => {
        const first = await createStaff('dedupe-first', ['operator'], {
            telegramChatId: 'same-chat',
            notifyTickets: true,
        });
        const second = await createStaff('dedupe-second', ['operator'], {
            telegramChatId: 'same-chat',
            notifyTickets: true,
        });
        const ticket = await createTicket();
        const input = {
            dedupeKey: 'sec-r2:staff-dedupe',
            platform: 'telegram' as const,
            recipientChatId: 'same-chat',
            kind: 'text' as const,
            audience: 'staff' as const,
            recipientStaffId: first.id,
            sourceType: 'ticket',
            sourceId: ticket.id,
            payload: { text: 'Staff notification' },
        };
        await outbound.enqueue(input);
        await expect(
            outbound.enqueue({ ...input, recipientStaffId: second.id }),
        ).rejects.toThrow('refers to another intent');
    });

    async function createStaff(
        login: string,
        roles: AdminRole[],
        overrides: Partial<AdminUserEntity> = {},
    ) {
        const repository = dataSource.getRepository(AdminUserEntity);
        const admin = await repository.save(
            repository.create({
                login,
                displayName: login,
                passwordHash: 'hash',
                isActive: true,
                ...overrides,
            }),
        );
        await dataSource
            .getRepository(AdminUserRoleEntity)
            .save(roles.map((role) => ({ userId: admin.id, role })));
        return admin;
    }

    async function seedServiceForm() {
        serviceType = await dataSource.getRepository(ServiceTypeEntity).save({
            code: 'sec_r2_service',
            title: 'SEC-R2 service',
            description: null,
            flow: 'simple',
            isActive: true,
            settings: null,
        });
        const definition = await dataSource
            .getRepository(ServiceFormDefinitionEntity)
            .save({
                serviceTypeId: serviceType.id,
                isActive: true,
                supportedChannels: ['web', 'telegram', 'max'],
            });
        formVersion = await dataSource
            .getRepository(ServiceFormVersionEntity)
            .save({
                definitionId: definition.id,
                version: 1,
                status: 'published',
                schema: { fields: [] },
                handlerKey: null,
                publishedAt: new Date(),
                createdByStaffId: null,
            });
    }

    function createRegistration(assignedEngineerId: number | null) {
        return dataSource.getRepository(RegistrationRequestEntity).save({
            chatId: `registration-${Date.now()}-${Math.random()}`,
            platform: 'web',
            status: 'new',
            assignedEngineerId,
        });
    }

    async function createServiceRequest(
        assignedEngineerId: number | null,
    ): Promise<ServiceRequestEntity> {
        const repository = dataSource.getRepository(ServiceRequestEntity);
        const suffix = `${Date.now()}-${Math.random()}`;
        const request = repository.create({
            requestNumber: `SEC-R2-${suffix}`,
            serviceTypeId: serviceType.id,
            serviceTypeCode: serviceType.code,
            serviceTypeTitle: serviceType.title,
            formVersionId: formVersion.id,
            userId: null,
            organizationId: null,
            platform: 'web',
            source: 'admin',
            chatId: `service-${suffix}`,
            status: 'submitted',
            customerStatus: 'received',
            answers: {},
            contactSnapshot: null,
            assignedEngineerId,
        });
        return repository.save(request);
    }

    function createTicket() {
        return dataSource.getRepository(TicketEntity).save({
            userChatId: `ticket-${Date.now()}-${Math.random()}`,
            platform: 'telegram',
            isAnswered: false,
        });
    }

    function createStoredFile() {
        return dataSource.getRepository(StoredFileEntity).save({
            provider: 'local',
            objectKey: `sec-r2/${Date.now()}.pdf`,
            originalName: 'registration.pdf',
            mimeType: 'application/pdf',
            sizeBytes: '10',
            sha256: 'b'.repeat(64),
            status: 'active',
            metadata: { purpose: 'sec-r2-test' },
        });
    }

    async function enqueueNotification(
        kind: 'registrations' | 'tickets' | 'serviceRequests',
        sourceType: 'registration' | 'ticket' | 'service_request',
        sourceId: number,
        dedupeKey: string,
    ) {
        await notifications.notify(kind, 'SEC-R2 test', {
            dedupeKey,
            sourceType,
            sourceId,
        });
        return outbound.repository
            .createQueryBuilder('delivery')
            .where('delivery.dedupeKey LIKE :prefix', {
                prefix: `${dedupeKey}:staff:%`,
            })
            .getOneOrFail();
    }

    async function expectRecipients(prefix: string, expectedIds: number[]) {
        const deliveries = await outbound.repository
            .createQueryBuilder('delivery')
            .where('delivery.dedupeKey LIKE :prefix', { prefix: `${prefix}%` })
            .orderBy('delivery.recipientStaffId', 'ASC')
            .getMany();
        expect(
            deliveries
                .map((item) => item.recipientStaffId)
                .sort((left, right) => Number(left) - Number(right)),
        ).toEqual([...expectedIds].sort((left, right) => left - right));
    }

    async function expectTerminalAuthorizationFailure(deliveryId: number) {
        await processor.processBatch(new Date());
        expect(sendMessage).not.toHaveBeenCalled();
        expect(await outbound.get(deliveryId)).toMatchObject({
            status: 'failed',
            attemptCount: 1,
            lastError: 'Staff notification authorization revoked',
        });
        expect(await processor.processBatch(new Date())).toBe(0);
        expect(sendMessage).not.toHaveBeenCalled();
    }
});
