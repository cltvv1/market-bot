import type { DataSource } from 'typeorm';
import testDataSource from '../src/database/test-data-source';
import { RegistrationReadinessService } from '../src/registrations/registration-readiness.service';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { RegistrationRequirementEntity } from '../src/registrations/entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from '../src/registrations/entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from '../src/registrations/entities/registration-data-request.entity';
import { EquipmentKitEntity } from '../src/assets/entities/equipment-kit.entity';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import type { FilesService } from '../src/files/files.service';
import type { MessengerService } from '../src/messenger/messenger.types';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { OutboundDeliveriesService } from '../src/outbound-deliveries/outbound-deliveries.service';
import { RegistrationFieldEntity } from '../src/registrations/entities/registration-field.entity';
import { RegistrationsService } from '../src/registrations/registrations.service';

describe('KKT registration readiness on PostgreSQL', () => {
    let dataSource: DataSource;
    let service: RegistrationReadinessService;
    let registrationsService: RegistrationsService;
    let outbound: OutboundDeliveriesService;
    let registrationId: number;
    let staffId: number;

    beforeAll(async () => {
        dataSource = testDataSource;
        if (!dataSource.isInitialized) await dataSource.initialize();
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'typeorm_migrations'`,
        );
        await dataSource.query(
            `TRUNCATE TABLE ${tables.map(({ table_name }) => `"public"."${table_name}"`).join(',')} RESTART IDENTITY CASCADE`,
        );
        const staff = await dataSource.getRepository(AdminUserEntity).save({
            login: 'registration-operator',
            displayName: 'Registration Operator',
            passwordHash: 'synthetic',
            isActive: true,
            telegramChatId: 'registration-operator-chat',
            notifyRegistrations: true,
        });
        staffId = staff.id;
        await dataSource
            .getRepository(AdminUserRoleEntity)
            .save({ userId: staffId, role: 'operator' });
        const registration = await dataSource
            .getRepository(RegistrationRequestEntity)
            .save({
                chatId: 'web-registration-owner',
                platform: 'web',
                currentStep: 99,
                status: 'new',
                priority: 'normal',
                ofdProvisionMode: 'clarification_required',
                readiness: 'incomplete',
            });
        registrationId = registration.id;
        const messenger: jest.Mocked<MessengerService> = {
            sendMessage: jest.fn(),
            sendImage: jest.fn(),
            sendDocument: jest.fn(),
        };
        service = new RegistrationReadinessService(
            dataSource,
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(RegistrationRequirementEntity),
            dataSource.getRepository(RegistrationEvidenceEntity),
            dataSource.getRepository(RegistrationDataRequestEntity),
            dataSource.getRepository(EquipmentKitEntity),
            {} as FilesService,
            new AuditService(dataSource.getRepository(AuditEventEntity)),
            messenger,
        );
        outbound = new OutboundDeliveriesService(
            dataSource.getRepository(OutboundDeliveryEntity),
            dataSource,
        );
        registrationsService = createRegistrationsService(
            new AdminNotificationsService(
                dataSource.getRepository(AdminUserEntity),
                outbound,
            ),
        );
    });

    afterAll(async () => {
        if (dataSource.isInitialized) await dataSource.destroy();
    });

    it('keeps the checklist idempotent and gates handoff until every item is verified', async () => {
        await service.initialize(registrationId);
        await service.initialize(registrationId);
        expect(
            await dataSource
                .getRepository(RegistrationRequirementEntity)
                .countBy({ registrationId }),
        ).toBe(3);

        const firstRequest = await service.requestData(
            registrationId,
            'kkt_serial',
            staffId,
            'Provide synthetic KKT data',
        );
        const repeatedRequest = await service.requestData(
            registrationId,
            'kkt_serial',
            staffId,
            'Ignored duplicate',
        );
        expect(repeatedRequest.id).toBe(firstRequest.id);
        await expect(
            service.handoff(registrationId, staffId),
        ).rejects.toMatchObject({ status: 409 });

        const owner = {
            platform: 'web' as const,
            chatId: 'web-registration-owner',
        };
        await expect(
            service.provideValue(
                { platform: 'web', chatId: 'another-browser' },
                registrationId,
                'kkt_serial',
                'KKT-SYNTHETIC-1',
            ),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            service.activateRequest(
                { platform: 'web', chatId: 'another-browser' },
                firstRequest.responseToken,
            ),
        ).rejects.toMatchObject({ status: 404 });
        await service.activateRequest(owner, firstRequest.responseToken);
        const restartedService = new RegistrationReadinessService(
            dataSource,
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(RegistrationRequirementEntity),
            dataSource.getRepository(RegistrationEvidenceEntity),
            dataSource.getRepository(RegistrationDataRequestEntity),
            dataSource.getRepository(EquipmentKitEntity),
            {} as FilesService,
            new AuditService(dataSource.getRepository(AuditEventEntity)),
            {
                sendMessage: jest.fn(),
                sendImage: jest.fn(),
                sendDocument: jest.fn(),
            },
        );
        expect((await restartedService.activeRequest(owner))?.id).toBe(
            firstRequest.id,
        );
        await restartedService.provideActiveText(owner, 'KKT-SYNTHETIC-1');
        expect(await restartedService.activeRequest(owner)).toBeNull();
        await expect(
            restartedService.activateRequest(owner, firstRequest.responseToken),
        ).rejects.toMatchObject({ status: 400 });
        await service.verify(registrationId, 'kkt_serial', staffId);
        await service.provideStaffValue(
            registrationId,
            'fiscal_drive_serial',
            staffId,
            'FN-SYNTHETIC-1',
        );
        await service.verify(registrationId, 'fiscal_drive_serial', staffId);
        await service.setOfdMode(
            registrationId,
            'purchase_from_vitma',
            staffId,
        );
        await expect(
            service.markNotRequired(registrationId, 'ofd_code', staffId, ''),
        ).rejects.toMatchObject({ status: 400 });
        await service.provideValue(
            owner,
            registrationId,
            'ofd_code',
            'OFD-SYNTHETIC-SECRET-1',
        );
        expect(await service.recompute(registrationId)).toBe(
            'awaiting_verification',
        );
        await service.verify(registrationId, 'ofd_code', staffId);
        expect(await service.recompute(registrationId)).toBe('ready');

        const [handedOff, repeatedHandoff] = await Promise.all([
            service.handoff(registrationId, staffId),
            service.handoff(registrationId, staffId),
        ]);
        expect(handedOff.handedOffAt).toBeTruthy();
        expect(repeatedHandoff.id).toBe(handedOff.id);
        expect(repeatedHandoff.status).toBe('processed');

        const audit = await dataSource.getRepository(AuditEventEntity).find();
        expect(
            JSON.stringify(audit.map((item) => item.metadata)),
        ).not.toContain('OFD-SYNTHETIC-SECRET-1');
        expect(
            audit.some((item) => item.action === 'registration.handoff.denied'),
        ).toBe(true);
        expect(
            audit.some(
                (item) => item.action === 'registration.handoff.allowed',
            ),
        ).toBe(true);
    });

    it('commits registration handoff, audit and staff completion delivery atomically', async () => {
        const registration = await makeReady();

        const handedOff = await registrationsService.doReg(
            registration,
            staffId,
        );

        expect(handedOff).toMatchObject({
            id: registrationId,
            status: 'processed',
        });
        expect(handedOff.handedOffAt).toBeTruthy();
        expect(
            await dataSource.getRepository(AuditEventEntity).countBy({
                action: 'registration.handoff.allowed',
                targetId: String(registrationId),
            }),
        ).toBe(1);
        expect(
            await outbound.repository.find({
                where: {
                    sourceType: 'registration',
                    sourceId: String(registrationId),
                },
            }),
        ).toEqual([
            expect.objectContaining({
                dedupeKey: `registration:${registrationId}:completed:staff:${staffId}:telegram`,
                status: 'pending',
                audience: 'staff',
            }),
        ]);
    });

    it('rolls the handoff and audit back when completion enqueue fails', async () => {
        const registration = await makeReady();
        const failingService = createRegistrationsService({
            notify: jest
                .fn()
                .mockRejectedValue(
                    new Error('forced completion enqueue failure'),
                ),
        } as unknown as AdminNotificationsService);

        await expect(
            failingService.doReg(registration, staffId),
        ).rejects.toThrow('forced completion enqueue failure');

        expect(
            await dataSource
                .getRepository(RegistrationRequestEntity)
                .findOneByOrFail({ id: registrationId }),
        ).toMatchObject({ status: 'new', handedOffAt: null });
        expect(
            await dataSource.getRepository(AuditEventEntity).countBy({
                action: 'registration.handoff.allowed',
                targetId: String(registrationId),
            }),
        ).toBe(0);
        expect(await outbound.repository.count()).toBe(0);
    });

    it('keeps repeated completion idempotent', async () => {
        const registration = await makeReady();

        await registrationsService.doReg(registration, staffId);
        const repeated = await registrationsService.doReg(
            registration,
            staffId,
        );

        expect(repeated).toMatchObject({
            id: registrationId,
            status: 'processed',
        });
        expect(await outbound.repository.count()).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).countBy({
                action: 'registration.handoff.allowed',
                targetId: String(registrationId),
            }),
        ).toBe(1);
    });

    it('does not enqueue completion delivery when readiness denies handoff', async () => {
        const registration = await dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: registrationId });

        await expect(
            registrationsService.doReg(registration, staffId),
        ).rejects.toMatchObject({ status: 409 });

        expect(
            await dataSource
                .getRepository(RegistrationRequestEntity)
                .findOneByOrFail({ id: registrationId }),
        ).toMatchObject({ status: 'new', handedOffAt: null });
        expect(await outbound.repository.count()).toBe(0);
    });

    function createRegistrationsService(
        notifications: AdminNotificationsService,
    ) {
        return new RegistrationsService(
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(RegistrationFieldEntity),
            {} as never,
            {} as never,
            notifications,
            {} as FilesService,
            service,
            dataSource,
        );
    }

    async function makeReady() {
        await service.initialize(registrationId);
        await dataSource
            .getRepository(RegistrationRequirementEntity)
            .update(
                { registrationId },
                { status: 'verified', verifiedAt: new Date() },
            );
        await dataSource
            .getRepository(RegistrationRequestEntity)
            .update(
                { id: registrationId },
                { ofdProvisionMode: 'customer_has_code' },
            );
        expect(await service.recompute(registrationId)).toBe('ready');
        return dataSource
            .getRepository(RegistrationRequestEntity)
            .findOneByOrFail({ id: registrationId });
    }
});
