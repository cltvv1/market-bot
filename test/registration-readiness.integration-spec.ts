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
import type { FilesService } from '../src/files/files.service';
import type { MessengerService } from '../src/messenger/messenger.types';

describe('KKT registration readiness on PostgreSQL', () => {
    let dataSource: DataSource;
    let service: RegistrationReadinessService;
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
});
