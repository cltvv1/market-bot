import type { DataSource } from 'typeorm';
import testDataSource from '../src/database/test-data-source';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { IntegrationRunEntity } from '../src/integrations/entities/integration-run.entity';
import { ServiceOpportunityEntity } from '../src/integrations/entities/service-opportunity.entity';
import { ExternalObservationEntity } from '../src/integrations/entities/external-observation.entity';
import { ExternalMappingEntity } from '../src/integrations/entities/external-mapping.entity';
import { OrganizationContactEntity } from '../src/integrations/entities/organization-contact.entity';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { CashRegisterEntity } from '../src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from '../src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from '../src/assets/entities/ofd-subscription.entity';
import { ServiceTypeEntity } from '../src/service-requests/entities/service-type.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { IntegrationErrorEntity } from '../src/integrations/entities/integration-error.entity';
import { IntegrationExclusionEntity } from '../src/integrations/entities/integration-exclusion.entity';
import { ServiceFormService } from '../src/service-requests/service-form.service';
import { ServiceFormDefinitionEntity } from '../src/service-requests/entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from '../src/service-requests/entities/service-form-version.entity';

describe('external integrations on migrated PostgreSQL', () => {
    let dataSource: DataSource;
    let service: IntegrationsService;
    const serviceRequests = {
        getRequest: jest.fn(),
        createFromOpportunity: jest.fn(),
    };

    beforeAll(async () => {
        dataSource = testDataSource;
        await dataSource.initialize();
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations'`,
        );
        await dataSource.query(
            `TRUNCATE TABLE ${tables.map(({ table_name }) => `"public"."${table_name.replaceAll('"', '""')}"`).join(', ')} RESTART IDENTITY CASCADE`,
        );
        jest.clearAllMocks();
        service = new IntegrationsService(
            dataSource,
            dataSource.getRepository(IntegrationRunEntity),
            dataSource.getRepository(ServiceOpportunityEntity),
            dataSource.getRepository(IntegrationErrorEntity),
            dataSource.getRepository(IntegrationExclusionEntity),
            serviceRequests as never,
        );
    });

    afterAll(async () => {
        if (dataSource?.isInitialized) await dataSource.destroy();
    });

    const platformPayload = () => ({
        provider: 'platforma_ofd' as const,
        kind: 'equipment_snapshot',
        mode: 'shadow' as const,
        sourceCursor: 'snapshot-1',
        organizations: [
            {
                externalId: 'org-1',
                inn: '2460000000',
                kpp: '246001001',
                name: 'ООО Тест',
            },
        ],
        cashRegisters: [
            {
                externalId: 'kkt-1',
                organizationExternalId: 'org-1',
                serialNumber: '00112233',
                registrationNumber: '0000112233445566',
                model: 'АТОЛ 30Ф',
                installationAddress: 'Красноярск',
            },
        ],
        fiscalDrives: [
            {
                externalId: 'fn-1',
                cashRegisterExternalId: 'kkt-1',
                serialNumber: '9999000011112222',
                validUntil: '2027-08-01T00:00:00.000Z',
            },
        ],
        ofdSubscriptions: [
            {
                externalId: 'ofd-1',
                cashRegisterExternalId: 'kkt-1',
                providerName: 'Платформа ОФД',
                validUntil: '2027-02-01T00:00:00.000Z',
                status: 'active' as const,
            },
        ],
        contacts: [
            {
                externalId: 'contact-1',
                organizationExternalId: 'org-1',
                kind: 'phone' as const,
                value: '8 (999) 123-45-67',
            },
        ],
        observations: [
            {
                externalId: 'signal-1',
                organizationExternalId: 'org-1',
                cashRegisterExternalId: 'kkt-1',
                type: 'fn_expiring',
                title: 'Заканчивается ФН',
                severity: 'high' as const,
                status: 'active' as const,
                occurredAt: '2026-08-17T00:00:00.000Z',
                metadata: {
                    providerStatus: 'active',
                    accessToken: 'must-not-be-stored',
                    detailsUrl: 'https://private.example/path',
                },
            },
        ],
    });

    it('imports normalized equipment and creates one opportunity', async () => {
        const result = await service.importBatch(platformPayload());

        expect(result).toMatchObject({
            received: 6,
            applied: 6,
            skipped: 0,
            mode: 'shadow',
        });
        expect(await dataSource.getRepository(OrganizationEntity).count()).toBe(
            1,
        );
        expect(
            await dataSource
                .getRepository(CashRegisterEntity)
                .findOneByOrFail({ serialNumber: '00112233' }),
        ).toMatchObject({
            installationAddress: 'Красноярск',
            registrationNumber: '0000112233445566',
        });
        expect(await dataSource.getRepository(FiscalDriveEntity).count()).toBe(
            1,
        );
        expect(
            await dataSource.getRepository(OfdSubscriptionEntity).count(),
        ).toBe(1);
        expect(
            await dataSource
                .getRepository(OrganizationContactEntity)
                .findOneByOrFail({ externalId: 'contact-1' }),
        ).toMatchObject({ normalizedValue: '+79991234567' });
        const observation = await dataSource
            .getRepository(ExternalObservationEntity)
            .findOneByOrFail({ externalKey: 'signal-1' });
        expect(observation.metadata).toEqual({ providerStatus: 'active' });
        expect(
            await dataSource.getRepository(ServiceOpportunityEntity).count(),
        ).toBe(1);
    });

    it('is idempotent for repeated provider snapshots', async () => {
        await service.importBatch(platformPayload());
        await service.importBatch(platformPayload());

        expect(await dataSource.getRepository(OrganizationEntity).count()).toBe(
            1,
        );
        expect(await dataSource.getRepository(CashRegisterEntity).count()).toBe(
            1,
        );
        expect(
            await dataSource.getRepository(ExternalObservationEntity).count(),
        ).toBe(1);
        expect(
            await dataSource.getRepository(ServiceOpportunityEntity).count(),
        ).toBe(1);
        expect(
            await dataSource.getRepository(ExternalMappingEntity).count(),
        ).toBe(5);
    });

    it('merges ATOL and OFD observations into one equipment opportunity', async () => {
        await service.importBatch(platformPayload());
        await service.importBatch({
            provider: 'atol_connect',
            kind: 'daily_events',
            mode: 'shadow',
            organizations: [
                {
                    externalId: 'atol-org-8',
                    inn: '2460000000',
                    kpp: '246001001',
                    name: 'Другое имя',
                },
            ],
            cashRegisters: [
                {
                    externalId: 'atol-kkt-8',
                    organizationExternalId: 'atol-org-8',
                    serialNumber: '00112233',
                    model: 'АТОЛ 30Ф',
                },
            ],
            fiscalDrives: [],
            ofdSubscriptions: [],
            contacts: [],
            observations: [
                {
                    externalId: 'atol-event-8',
                    organizationExternalId: 'atol-org-8',
                    cashRegisterExternalId: 'atol-kkt-8',
                    type: 'fn_expiring',
                    title: 'Заканчивается ФН',
                    severity: 'urgent',
                    occurredAt: '2026-08-17T02:00:00.000Z',
                },
            ],
        });

        const opportunities = await dataSource
            .getRepository(ServiceOpportunityEntity)
            .find();
        expect(opportunities).toHaveLength(1);
        expect(opportunities[0].priority).toBe('urgent');
        expect(
            await dataSource.getRepository(ExternalObservationEntity).count(),
        ).toBe(2);
        expect(
            (
                await dataSource
                    .getRepository(OrganizationEntity)
                    .findOneByOrFail({ inn: '2460000000' })
            ).name,
        ).toBe('ООО Тест');
    });

    it('keeps excluded observations but does not create an operator opportunity', async () => {
        await service.createExclusion({
            inn: '2460000000',
            provider: 'platforma_ofd',
            observationType: 'fn_expiring',
            reason: 'Обслуживается самостоятельно',
        });

        await service.importBatch(platformPayload());

        expect(
            await dataSource.getRepository(ExternalObservationEntity).count(),
        ).toBe(1);
        expect(
            await dataSource.getRepository(ServiceOpportunityEntity).count(),
        ).toBe(0);
        expect(await dataSource.getRepository(OrganizationEntity).count()).toBe(
            1,
        );
        expect(await dataSource.getRepository(CashRegisterEntity).count()).toBe(
            1,
        );
    });

    it('stores resolved observations without creating stale operator work', async () => {
        const payload = platformPayload();
        payload.observations[0].status = 'resolved';

        await service.importBatch(payload);

        expect(
            await dataSource
                .getRepository(ExternalObservationEntity)
                .findOneByOrFail({ externalKey: 'signal-1' }),
        ).toMatchObject({ status: 'resolved' });
        expect(
            await dataSource.getRepository(ServiceOpportunityEntity).count(),
        ).toBe(0);
    });

    it('resolves and reopens an opportunity as its provider signal changes', async () => {
        const payload = platformPayload();
        await service.importBatch(payload);

        payload.observations[0].status = 'resolved';
        payload.sourceCursor = 'snapshot-2';
        await service.importBatch(payload);
        expect(
            await dataSource
                .getRepository(ServiceOpportunityEntity)
                .findOneByOrFail({ type: 'fn_expiring' }),
        ).toMatchObject({ status: 'resolved' });

        payload.observations[0].status = 'active';
        payload.sourceCursor = 'snapshot-3';
        await service.importBatch(payload);
        expect(
            await dataSource
                .getRepository(ServiceOpportunityEntity)
                .findOneByOrFail({ type: 'fn_expiring' }),
        ).toMatchObject({ status: 'new', resolvedAt: null });
    });

    it('records a sanitized integration error when an import batch fails', async () => {
        const payload = platformPayload();
        payload.cashRegisters[0].organizationExternalId =
            'missing-organization';
        payload.cashRegisters[0].organizationInn = undefined;

        await expect(service.importBatch(payload)).rejects.toThrow(
            'has no organization match',
        );

        const run = await dataSource
            .getRepository(IntegrationRunEntity)
            .findOneByOrFail({ provider: 'platforma_ofd' });
        expect(run).toMatchObject({ status: 'failed', errorCount: 1 });
        const error = await dataSource
            .getRepository(IntegrationErrorEntity)
            .findOneByOrFail({ integrationRunId: run.id });
        expect(error.message).toContain('has no organization match');
        expect(error.message).not.toContain('http');
    });

    it('converts an opportunity to a service request only once', async () => {
        await service.importBatch(platformPayload());
        const opportunity = await dataSource
            .getRepository(ServiceOpportunityEntity)
            .findOneByOrFail({ type: 'fn_expiring' });
        const serviceType = await dataSource
            .getRepository(ServiceTypeEntity)
            .save({
                code: 'fn_replacement',
                title: 'Замена ФН',
                description: null,
                flow: 'fn_replacement',
                isActive: true,
                settings: null,
            });
        const formVersion = await new ServiceFormService(
            dataSource.getRepository(ServiceFormDefinitionEntity),
            dataSource.getRepository(ServiceFormVersionEntity),
        ).getPublishedForType(serviceType);
        const request = await dataSource
            .getRepository(ServiceRequestEntity)
            .save({
                requestNumber: 'SR-20260822-INTEGRATION01',
                serviceTypeId: serviceType.id,
                serviceTypeCode: serviceType.code,
                serviceTypeTitle: serviceType.title,
                formVersionId: formVersion.id,
                userId: null,
                organizationId: opportunity.organizationId,
                platform: 'web',
                source: 'integration',
                chatId: `opportunity:${opportunity.id}`,
                status: 'review_required',
                customerStatus: 'received',
                currentStep: 4,
                answers: {},
                priority: 'high',
            } as ServiceRequestEntity);
        const admin = await dataSource.getRepository(AdminUserEntity).save({
            login: 'integration-operator',
            displayName: 'Оператор',
            passwordHash: 'test',
        });
        serviceRequests.createFromOpportunity.mockResolvedValue(request);
        serviceRequests.getRequest.mockResolvedValue(request);

        const first = await service.convertOpportunity(
            opportunity.id,
            admin.id,
        );
        const second = await service.convertOpportunity(
            opportunity.id,
            admin.id,
        );

        expect(first.request.id).toBe(request.id);
        expect(second.request.id).toBe(request.id);
        expect(serviceRequests.createFromOpportunity).toHaveBeenCalledTimes(1);
        expect(serviceRequests.createFromOpportunity).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId: opportunity.id,
                type: 'fn_expiring',
            }),
        );
        expect(
            await dataSource
                .getRepository(ServiceOpportunityEntity)
                .findOneByOrFail({ id: opportunity.id }),
        ).toMatchObject({
            status: 'converted',
            serviceRequestId: request.id,
            assignedAdminId: admin.id,
        });
    });
});
