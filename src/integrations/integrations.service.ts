import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import {
    FiscalDriveEntity,
    type AssetDataSource,
} from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { IntegrationRunEntity } from './entities/integration-run.entity';
import { ExternalMappingEntity } from './entities/external-mapping.entity';
import { OrganizationContactEntity } from './entities/organization-contact.entity';
import { ExternalObservationEntity } from './entities/external-observation.entity';
import { ServiceOpportunityEntity } from './entities/service-opportunity.entity';
import { OpportunityObservationEntity } from './entities/opportunity-observation.entity';
import { IntegrationErrorEntity } from './entities/integration-error.entity';
import { IntegrationExclusionEntity } from './entities/integration-exclusion.entity';
import type {
    IntegrationCashRegisterDto,
    IntegrationContactDto,
    IntegrationFiscalDriveDto,
    IntegrationImportDto,
    IntegrationObservationDto,
    IntegrationOfdSubscriptionDto,
    IntegrationOrganizationDto,
    OpportunityListQueryDto,
    CreateIntegrationExclusionDto,
    UpdateIntegrationExclusionDto,
    UpdateOpportunityDto,
} from './dto/integration-import.dto';
import type {
    ExternalEntityType,
    IntegrationProvider,
} from './integration.types';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';

interface ImportContext {
    provider: IntegrationProvider;
    runId: string;
    organizationIds: Map<string, number>;
    cashRegisterIds: Map<string, number>;
}

@Injectable()
export class IntegrationsService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(IntegrationRunEntity)
        private readonly runs: Repository<IntegrationRunEntity>,
        @InjectRepository(ServiceOpportunityEntity)
        private readonly opportunities: Repository<ServiceOpportunityEntity>,
        @InjectRepository(IntegrationErrorEntity)
        private readonly errors: Repository<IntegrationErrorEntity>,
        @InjectRepository(IntegrationExclusionEntity)
        private readonly exclusions: Repository<IntegrationExclusionEntity>,
        private readonly serviceRequests: ServiceRequestsService,
    ) {}

    async importBatch(input: IntegrationImportDto) {
        const receivedCount =
            input.organizations.length +
            input.cashRegisters.length +
            input.fiscalDrives.length +
            input.ofdSubscriptions.length +
            input.contacts.length +
            input.observations.length;
        const syncId =
            input.syncId ??
            `${input.provider}:${input.kind}:${input.sourceCursor ?? Date.now()}`;
        const batchIndex = input.batchIndex ?? 1;
        const batchCount = input.batchCount ?? 1;
        if (batchIndex > batchCount)
            throw new BadRequestException(
                'Integration batch index exceeds batch count',
            );
        let run = await this.runs
            .createQueryBuilder('run')
            .where('run.provider = :provider', { provider: input.provider })
            .andWhere('run.kind = :kind', { kind: input.kind })
            .andWhere("run.checkpoint ->> 'syncId' = :syncId", { syncId })
            .getOne();
        const completedBatches = Array.isArray(
            run?.checkpoint?.completedBatches,
        )
            ? run.checkpoint.completedBatches.filter(
                  (value): value is number => typeof value === 'number',
              )
            : [];
        if (run && completedBatches.includes(batchIndex)) {
            return {
                runId: run.id,
                received: receivedCount,
                applied: 0,
                skipped: receivedCount,
                mode: run.mode,
                duplicateBatch: true,
            };
        }
        if (!run) {
            run = await this.runs.save(
                this.runs.create({
                    provider: input.provider,
                    kind: input.kind,
                    mode: input.mode ?? 'shadow',
                    status: 'running',
                    receivedCount: 0,
                    appliedCount: 0,
                    skippedCount: 0,
                    errorCount: 0,
                    checkpoint: {
                        sourceCursor: input.sourceCursor ?? null,
                        syncId,
                        batchCount,
                        completedBatches: [],
                    },
                    errorSummary: null,
                    startedAt: new Date(),
                    finishedAt: null,
                }),
            );
        }

        try {
            const result = await this.dataSource.transaction(
                async (manager) => {
                    const context: ImportContext = {
                        provider: input.provider,
                        runId: run.id,
                        organizationIds: new Map(),
                        cashRegisterIds: new Map(),
                    };
                    let applied = 0;
                    for (const item of input.organizations) {
                        await this.applyOrganization(manager, context, item);
                        applied += 1;
                    }
                    for (const item of input.cashRegisters) {
                        await this.applyCashRegister(manager, context, item);
                        applied += 1;
                    }
                    for (const item of input.fiscalDrives) {
                        applied += (await this.applyFiscalDrive(
                            manager,
                            context,
                            item,
                        ))
                            ? 1
                            : 0;
                    }
                    for (const item of input.ofdSubscriptions) {
                        applied += (await this.applyOfdSubscription(
                            manager,
                            context,
                            item,
                        ))
                            ? 1
                            : 0;
                    }
                    for (const item of input.contacts) {
                        applied += (await this.applyContact(
                            manager,
                            context,
                            item,
                        ))
                            ? 1
                            : 0;
                    }
                    for (const item of input.observations) {
                        applied += (await this.applyObservation(
                            manager,
                            context,
                            item,
                        ))
                            ? 1
                            : 0;
                    }
                    return { applied, skipped: receivedCount - applied };
                },
            );

            const nextCompleted = [...completedBatches, batchIndex].sort(
                (left, right) => left - right,
            );
            run.status =
                nextCompleted.length >= batchCount ? 'succeeded' : 'running';
            run.receivedCount += receivedCount;
            run.appliedCount += result.applied;
            run.skippedCount += result.skipped;
            run.checkpoint = {
                sourceCursor: input.sourceCursor ?? null,
                syncId,
                batchCount,
                completedBatches: nextCompleted,
            };
            run.finishedAt = run.status === 'succeeded' ? new Date() : null;
            await this.runs.save(run);
            return {
                runId: run.id,
                ...result,
                received: receivedCount,
                mode: run.mode,
            };
        } catch (error) {
            run.status = run.appliedCount > 0 ? 'partial' : 'failed';
            run.errorCount += 1;
            run.errorSummary = this.safeError(error);
            run.finishedAt = new Date();
            await this.runs.save(run);
            await this.recordImportError(run, input.kind, error);
            throw error;
        }
    }

    listRuns(limit = 30) {
        return this.runs.find({
            order: { createdAt: 'DESC' },
            take: Math.min(Math.max(limit, 1), 100),
        });
    }

    listErrors(runId?: string, limit = 100) {
        return this.errors.find({
            where: runId ? { integrationRunId: runId } : {},
            order: { createdAt: 'DESC' },
            take: Math.min(Math.max(limit, 1), 200),
        });
    }

    listExclusions() {
        return this.exclusions.find({
            order: { isActive: 'DESC', updatedAt: 'DESC' },
        });
    }

    async createExclusion(input: CreateIntegrationExclusionDto) {
        const inn = this.normalizeInn(input.inn);
        const provider = input.provider ?? null;
        const observationType = input.observationType?.trim() || null;
        const repository = this.exclusions;
        let exclusion = await repository
            .createQueryBuilder('exclusion')
            .where('exclusion.inn = :inn', { inn })
            .andWhere(
                provider
                    ? 'exclusion.provider = :provider'
                    : 'exclusion.provider IS NULL',
                { provider },
            )
            .andWhere(
                observationType
                    ? 'exclusion.observationType = :observationType'
                    : 'exclusion.observationType IS NULL',
                { observationType },
            )
            .getOne();
        exclusion ??= repository.create({
            inn,
            provider,
            observationType,
            reason: null,
            isActive: true,
        });
        exclusion.reason = input.reason?.trim() || null;
        exclusion.isActive = true;
        return repository.save(exclusion);
    }

    async updateExclusion(id: number, input: UpdateIntegrationExclusionDto) {
        const exclusion = await this.exclusions.findOne({ where: { id } });
        if (!exclusion)
            throw new NotFoundException('Integration exclusion was not found');
        if (input.isActive !== undefined) exclusion.isActive = input.isActive;
        if (input.reason !== undefined)
            exclusion.reason = input.reason.trim() || null;
        return this.exclusions.save(exclusion);
    }

    async listOpportunities(query: OpportunityListQueryDto) {
        const builder = this.opportunities
            .createQueryBuilder('opportunity')
            .leftJoinAndSelect('opportunity.organization', 'organization')
            .leftJoinAndSelect('opportunity.cashRegister', 'cashRegister')
            .select([
                'opportunity',
                'organization.id',
                'organization.name',
                'organization.inn',
                'cashRegister.id',
                'cashRegister.model',
                'cashRegister.serialNumber',
                'cashRegister.registrationNumber',
            ])
            .addSelect(
                (subquery) =>
                    subquery
                        .select(
                            "string_agg(DISTINCT observation.provider, ',')",
                        )
                        .from(OpportunityObservationEntity, 'link')
                        .innerJoin(
                            ExternalObservationEntity,
                            'observation',
                            'observation.id = link.observationId',
                        )
                        .where('link.opportunityId = opportunity.id'),
                'providers',
            )
            .orderBy('opportunity.lastSeenAt', 'DESC');
        if (query.status && query.status !== 'all') {
            builder.andWhere('opportunity.status = :status', {
                status: query.status,
            });
        }
        if (query.search?.trim()) {
            builder.andWhere(
                '(organization.name ILIKE :search OR organization.inn ILIKE :search OR cashRegister."serialNumber" ILIKE :search OR opportunity.title ILIKE :search)',
                { search: `%${query.search.trim()}%` },
            );
        }
        if (query.provider) {
            builder.andWhere(
                `EXISTS (
                SELECT 1 FROM opportunity_observations provider_link
                JOIN external_observations provider_observation ON provider_observation.id = provider_link."observationId"
                WHERE provider_link."opportunityId" = opportunity.id AND provider_observation.provider = :provider
            )`,
                { provider: query.provider },
            );
        }
        const { entities, raw } = await builder.getRawAndEntities();
        const rawRows = raw as Array<{ providers?: unknown }>;
        return entities.map((item, index) => {
            const providerList = rawRows[index]?.providers;
            return {
                ...item,
                providers:
                    typeof providerList === 'string'
                        ? providerList.split(',').filter(Boolean)
                        : [],
            };
        });
    }

    async getOpportunity(id: number) {
        const opportunity = await this.opportunities.findOne({ where: { id } });
        if (!opportunity)
            throw new NotFoundException('Service opportunity was not found');
        const observations = await this.dataSource
            .getRepository(ExternalObservationEntity)
            .createQueryBuilder('observation')
            .innerJoin(
                OpportunityObservationEntity,
                'link',
                'link.observationId = observation.id',
            )
            .where('link.opportunityId = :id', { id })
            .orderBy('observation.occurredAt', 'DESC')
            .getMany();
        const organization = opportunity.organizationId
            ? await this.dataSource
                  .getRepository(OrganizationEntity)
                  .findOne({ where: { id: opportunity.organizationId } })
            : null;
        const cashRegister = opportunity.cashRegisterId
            ? await this.dataSource
                  .getRepository(CashRegisterEntity)
                  .findOne({ where: { id: opportunity.cashRegisterId } })
            : null;
        return { opportunity, observations, organization, cashRegister };
    }

    async updateOpportunity(
        id: number,
        input: UpdateOpportunityDto,
        actorId: number,
    ) {
        const opportunity = await this.opportunities.findOne({ where: { id } });
        if (!opportunity)
            throw new NotFoundException('Service opportunity was not found');
        if (input.status) opportunity.status = input.status;
        if (input.comment !== undefined)
            opportunity.operatorComment = input.comment.trim() || null;
        if (input.callbackAt !== undefined)
            opportunity.callbackAt = input.callbackAt
                ? new Date(input.callbackAt)
                : null;
        opportunity.assignedAdminId =
            input.assignedAdminId ?? opportunity.assignedAdminId ?? actorId;
        opportunity.resolvedAt = ['resolved', 'not_relevant'].includes(
            opportunity.status,
        )
            ? new Date()
            : null;
        return this.opportunities.save(opportunity);
    }

    async convertOpportunity(id: number, actorId: number) {
        const opportunity = await this.opportunities.findOne({ where: { id } });
        if (!opportunity)
            throw new NotFoundException('Service opportunity was not found');
        if (!opportunity.organizationId)
            throw new BadRequestException(
                'Opportunity is not linked to an organization',
            );
        if (opportunity.serviceRequestId) {
            const existing = await this.serviceRequests.getRequest(
                opportunity.serviceRequestId,
            );
            if (existing) return { opportunity, request: existing };
        }
        const request = await this.serviceRequests.createFromOpportunity({
            opportunityId: opportunity.id,
            type: opportunity.type,
            organizationId: opportunity.organizationId,
            cashRegisterId: opportunity.cashRegisterId ?? undefined,
            title: opportunity.title,
            description: opportunity.description,
            priority: opportunity.priority,
            operatorId: actorId,
        });
        opportunity.serviceRequestId = request.id;
        opportunity.status = 'converted';
        opportunity.assignedAdminId ??= actorId;
        opportunity.resolvedAt = new Date();
        await this.opportunities.save(opportunity);
        return { opportunity, request };
    }

    private async applyOrganization(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationOrganizationDto,
    ) {
        const inn = this.normalizeInn(item.inn);
        const kpp = this.normalizeOptionalDigits(item.kpp);
        const organizationId = await this.findMappedId(
            manager,
            context.provider,
            'organization',
            item.externalId,
        );
        let organization = organizationId
            ? await manager.findOne(OrganizationEntity, {
                  where: { id: organizationId },
              })
            : null;
        if (!organization) {
            const matches = await manager
                .createQueryBuilder(OrganizationEntity, 'organization')
                .where('organization.inn = :inn', { inn })
                .andWhere(
                    kpp
                        ? 'organization.kpp = :kpp'
                        : 'organization.kpp IS NULL',
                    { kpp },
                )
                .getMany();
            if (matches.length > 1)
                throw new BadRequestException(
                    `Ambiguous organization identity for INN ${inn}`,
                );
            organization =
                matches[0] ??
                manager.create(OrganizationEntity, {
                    inn,
                    kpp,
                    ogrn: null,
                    name: null,
                    legalAddress: null,
                    actualAddress: null,
                    taxSystem: null,
                    isVerified: false,
                    lastSyncedAt: null,
                });
        }
        organization.name ||= item.name?.trim() || null;
        organization.ogrn ||= this.normalizeOptionalDigits(item.ogrn);
        organization.legalAddress ||= item.legalAddress?.trim() || null;
        organization.actualAddress ||= item.actualAddress?.trim() || null;
        organization.taxSystem ||= item.taxSystem?.trim() || null;
        organization.lastSyncedAt = new Date();
        organization = await manager.save(organization);
        context.organizationIds.set(item.externalId, organization.id);
        await this.upsertMapping(
            manager,
            context.provider,
            'organization',
            item.externalId,
            organization.id,
            item,
        );
        return organization.id;
    }

    private async applyCashRegister(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationCashRegisterDto,
    ) {
        const organizationId = await this.resolveOrganizationId(
            manager,
            context,
            item.organizationExternalId,
            item.organizationInn,
        );
        if (!organizationId)
            throw new BadRequestException(
                `Cash register ${item.externalId} has no organization match`,
            );
        const localId = await this.findMappedId(
            manager,
            context.provider,
            'cash_register',
            item.externalId,
        );
        let register = localId
            ? await manager.findOne(CashRegisterEntity, {
                  where: { id: localId },
              })
            : null;
        if (!register && item.registrationNumber?.trim()) {
            register = await manager.findOne(CashRegisterEntity, {
                where: { registrationNumber: item.registrationNumber.trim() },
            });
        }
        if (!register) {
            register = await manager.findOne(CashRegisterEntity, {
                where: {
                    organizationId,
                    serialNumber: item.serialNumber.trim(),
                },
            });
        }
        register ??= manager.create(CashRegisterEntity, {
            organizationId,
            serialNumber: item.serialNumber.trim(),
            model: null,
            registrationNumber: null,
            fnSerialNumber: null,
            ofdName: null,
            status: 'active',
            registeredAt: null,
            lastSyncedAt: null,
            installationAddress: null,
        });
        register.model ||= item.model?.trim() || null;
        register.registrationNumber ||= item.registrationNumber?.trim() || null;
        register.installationAddress ||=
            item.installationAddress?.trim() || null;
        register.registeredAt ||= this.toDate(item.registeredAt);
        if (['active', 'inactive', 'archived'].includes(item.status ?? '')) {
            register.status = item.status as CashRegisterEntity['status'];
        }
        register.lastSyncedAt = new Date();
        register = await manager.save(register);
        context.cashRegisterIds.set(item.externalId, register.id);
        await this.upsertMapping(
            manager,
            context.provider,
            'cash_register',
            item.externalId,
            register.id,
            item,
        );
        return register.id;
    }

    private async applyFiscalDrive(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationFiscalDriveDto,
    ) {
        const cashRegisterId = await this.resolveCashRegisterId(
            manager,
            context,
            item.cashRegisterExternalId,
        );
        if (!cashRegisterId) return false;
        const register = await manager.findOneByOrFail(CashRegisterEntity, {
            id: cashRegisterId,
        });
        const localId = await this.findMappedId(
            manager,
            context.provider,
            'fiscal_drive',
            item.externalId,
        );
        let drive = localId
            ? await manager.findOne(FiscalDriveEntity, {
                  where: { id: localId },
              })
            : null;
        drive ??= await manager.findOne(FiscalDriveEntity, {
            where: { cashRegisterId, serialNumber: item.serialNumber.trim() },
        });
        drive ??= manager.create(FiscalDriveEntity, {
            organizationId: register.organizationId,
            cashRegisterId,
            serialNumber: item.serialNumber.trim(),
            validFrom: null,
            validUntil: null,
            source: this.assetSource(context.provider),
            lastCheckedAt: null,
        });
        if (drive.source !== 'manual') {
            drive.validFrom = this.toDate(item.validFrom) ?? drive.validFrom;
            drive.validUntil = this.toDate(item.validUntil) ?? drive.validUntil;
            drive.source = this.assetSource(context.provider);
        }
        drive.lastCheckedAt = new Date();
        drive = await manager.save(drive);
        register.fnSerialNumber = drive.serialNumber;
        await manager.save(register);
        await this.upsertMapping(
            manager,
            context.provider,
            'fiscal_drive',
            item.externalId,
            drive.id,
            item,
        );
        return true;
    }

    private async applyOfdSubscription(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationOfdSubscriptionDto,
    ) {
        const cashRegisterId = await this.resolveCashRegisterId(
            manager,
            context,
            item.cashRegisterExternalId,
        );
        if (!cashRegisterId) return false;
        const register = await manager.findOneByOrFail(CashRegisterEntity, {
            id: cashRegisterId,
        });
        const localId = await this.findMappedId(
            manager,
            context.provider,
            'ofd_subscription',
            item.externalId,
        );
        let subscription = localId
            ? await manager.findOne(OfdSubscriptionEntity, {
                  where: { id: localId },
              })
            : null;
        subscription ??= manager.create(OfdSubscriptionEntity, {
            organizationId: register.organizationId,
            cashRegisterId,
            provider: item.providerName.trim(),
            contractNumber: null,
            validFrom: null,
            validUntil: null,
            status: 'unknown',
            source: this.assetSource(context.provider),
            lastCheckedAt: null,
        });
        if (subscription.source !== 'manual') {
            subscription.provider = item.providerName.trim();
            subscription.contractNumber =
                item.contractNumber?.trim() || subscription.contractNumber;
            subscription.validFrom =
                this.toDate(item.validFrom) ?? subscription.validFrom;
            subscription.validUntil =
                this.toDate(item.validUntil) ?? subscription.validUntil;
            subscription.status = item.status ?? subscription.status;
            subscription.source = this.assetSource(context.provider);
        }
        subscription.lastCheckedAt = new Date();
        subscription = await manager.save(subscription);
        register.ofdName = subscription.provider;
        await manager.save(register);
        await this.upsertMapping(
            manager,
            context.provider,
            'ofd_subscription',
            item.externalId,
            subscription.id,
            item,
        );
        return true;
    }

    private async applyContact(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationContactDto,
    ) {
        const organizationId = await this.resolveOrganizationId(
            manager,
            context,
            item.organizationExternalId,
            item.organizationInn,
        );
        if (!organizationId) return false;
        const normalizedValue =
            item.kind === 'phone'
                ? this.normalizePhone(item.value)
                : item.value.trim().toLowerCase();
        let contact = await manager.findOne(OrganizationContactEntity, {
            where: {
                organizationId,
                kind: item.kind,
                source: context.provider,
                externalId: item.externalId,
            },
        });
        contact ??= manager.create(OrganizationContactEntity, {
            organizationId,
            kind: item.kind,
            rawValue: item.value.trim(),
            normalizedValue,
            source: context.provider,
            externalId: item.externalId,
            quality: item.quality?.trim() || null,
            isActive: true,
            lastSeenAt: new Date(),
        });
        contact.rawValue = item.value.trim();
        contact.normalizedValue = normalizedValue;
        contact.quality = item.quality?.trim() || contact.quality;
        contact.isActive = true;
        contact.lastSeenAt = new Date();
        contact = await manager.save(contact);
        await this.upsertMapping(
            manager,
            context.provider,
            'contact',
            item.externalId,
            contact.id,
            item,
        );
        return true;
    }

    private async applyObservation(
        manager: EntityManager,
        context: ImportContext,
        item: IntegrationObservationDto,
    ) {
        const organizationId = await this.resolveOrganizationId(
            manager,
            context,
            item.organizationExternalId,
            item.organizationInn,
        );
        const cashRegisterId = item.cashRegisterExternalId
            ? await this.resolveCashRegisterId(
                  manager,
                  context,
                  item.cashRegisterExternalId,
              )
            : null;
        if (!organizationId && !cashRegisterId) return false;
        const now = new Date();
        const fingerprint = createHash('sha256')
            .update(
                JSON.stringify({
                    provider: context.provider,
                    externalId: item.externalId,
                    type: item.type,
                    status: item.status ?? 'active',
                    occurredAt: item.occurredAt,
                }),
            )
            .digest('hex');
        let observation = await manager.findOne(ExternalObservationEntity, {
            where: { provider: context.provider, externalKey: item.externalId },
        });
        observation ??= manager.create(ExternalObservationEntity, {
            provider: context.provider,
            externalKey: item.externalId,
            integrationRunId: context.runId,
            organizationId: organizationId ?? null,
            cashRegisterId: cashRegisterId ?? null,
            kind: item.type,
            severity: item.severity ?? 'normal',
            title: item.title.trim(),
            description: item.description?.trim() || null,
            status: item.status ?? 'active',
            fingerprint,
            metadata: null,
            occurredAt: new Date(item.occurredAt),
            lastSeenAt: now,
        });
        observation.integrationRunId = context.runId;
        observation.organizationId =
            organizationId ?? observation.organizationId;
        observation.cashRegisterId =
            cashRegisterId ?? observation.cashRegisterId;
        observation.severity = item.severity ?? observation.severity;
        observation.title = item.title.trim();
        observation.description = item.description?.trim() || null;
        observation.status = item.status ?? 'active';
        observation.fingerprint = fingerprint;
        observation.metadata = this.sanitizeMetadata(item.metadata);
        observation.occurredAt = new Date(item.occurredAt);
        observation.lastSeenAt = now;
        observation = await manager.save(observation);

        if (
            organizationId &&
            (await this.isExcluded(
                manager,
                organizationId,
                context.provider,
                item.type,
            ))
        ) {
            return true;
        }

        const subjectKey = cashRegisterId
            ? `cash-register:${cashRegisterId}`
            : `organization:${organizationId}`;
        const identityKey = createHash('sha256')
            .update(`${item.type.trim().toLowerCase()}|${subjectKey}`)
            .digest('hex');
        let opportunity = await manager.findOne(ServiceOpportunityEntity, {
            where: { identityKey },
        });

        if (observation.status === 'resolved') {
            if (!opportunity) return true;
            await manager.getRepository(OpportunityObservationEntity).upsert(
                {
                    opportunityId: opportunity.id,
                    observationId: observation.id,
                },
                ['opportunityId', 'observationId'],
            );
            const linkedObservations = await manager
                .getRepository(OpportunityObservationEntity)
                .find({
                    where: { opportunityId: opportunity.id },
                    relations: { observation: true },
                });
            const hasActiveObservation = linkedObservations.some(
                (link) => link.observation.status === 'active',
            );
            if (
                !hasActiveObservation &&
                ['new', 'in_progress', 'contact_later'].includes(
                    opportunity.status,
                )
            ) {
                opportunity.status = 'resolved';
                opportunity.resolvedAt = now;
                await manager.save(opportunity);
            }
            return true;
        }

        opportunity ??= manager.create(ServiceOpportunityEntity, {
            identityKey,
            organizationId: organizationId ?? null,
            cashRegisterId: cashRegisterId ?? null,
            type: item.type.trim(),
            title: item.title.trim(),
            description: item.description?.trim() || null,
            priority: this.opportunityPriority(item.severity),
            status: 'new',
            assignedAdminId: null,
            serviceRequestId: null,
            firstSeenAt: observation.occurredAt,
            lastSeenAt: observation.occurredAt,
            callbackAt: null,
            resolvedAt: null,
            operatorComment: null,
        });
        if (opportunity.status === 'resolved') {
            opportunity.status = 'new';
            opportunity.resolvedAt = null;
        }
        opportunity.lastSeenAt =
            observation.occurredAt > opportunity.lastSeenAt
                ? observation.occurredAt
                : opportunity.lastSeenAt;
        opportunity.title = item.title.trim();
        opportunity.description =
            item.description?.trim() || opportunity.description;
        opportunity.priority = this.maxPriority(
            opportunity.priority,
            this.opportunityPriority(item.severity),
        );
        opportunity = await manager.save(opportunity);
        await manager.getRepository(OpportunityObservationEntity).upsert(
            {
                opportunityId: opportunity.id,
                observationId: observation.id,
            },
            ['opportunityId', 'observationId'],
        );
        return true;
    }

    private async isExcluded(
        manager: EntityManager,
        organizationId: number,
        provider: IntegrationProvider,
        observationType: string,
    ) {
        const organization = await manager.findOne(OrganizationEntity, {
            where: { id: organizationId },
        });
        if (!organization?.inn) return false;
        return manager
            .getRepository(IntegrationExclusionEntity)
            .createQueryBuilder('exclusion')
            .where('exclusion.isActive = true')
            .andWhere('exclusion.inn = :inn', {
                inn: this.normalizeInn(organization.inn),
            })
            .andWhere(
                '(exclusion.provider IS NULL OR exclusion.provider = :provider)',
                { provider },
            )
            .andWhere(
                '(exclusion.observationType IS NULL OR exclusion.observationType = :observationType)',
                { observationType: observationType.trim() },
            )
            .getExists();
    }

    private async resolveOrganizationId(
        manager: EntityManager,
        context: ImportContext,
        externalId?: string,
        inn?: string,
    ) {
        if (externalId) {
            const cached = context.organizationIds.get(externalId);
            if (cached) return cached;
            const mapped = await this.findMappedId(
                manager,
                context.provider,
                'organization',
                externalId,
            );
            if (mapped) return mapped;
        }
        if (!inn) return null;
        const normalized = this.normalizeInn(inn);
        const matches = await manager.find(OrganizationEntity, {
            where: { inn: normalized },
            take: 2,
        });
        return matches.length === 1 ? matches[0].id : null;
    }

    private async resolveCashRegisterId(
        manager: EntityManager,
        context: ImportContext,
        externalId: string,
    ) {
        return (
            context.cashRegisterIds.get(externalId) ??
            (await this.findMappedId(
                manager,
                context.provider,
                'cash_register',
                externalId,
            ))
        );
    }

    private async findMappedId(
        manager: EntityManager,
        provider: IntegrationProvider,
        entityType: ExternalEntityType,
        externalId: string,
    ) {
        const mapping = await manager.findOne(ExternalMappingEntity, {
            where: { provider, entityType, externalId },
        });
        return mapping?.localId ?? null;
    }

    private async upsertMapping(
        manager: EntityManager,
        provider: IntegrationProvider,
        entityType: ExternalEntityType,
        externalId: string,
        localId: number,
        item: { externalRevision?: string; sourceUpdatedAt?: string },
    ) {
        const repository = manager.getRepository(ExternalMappingEntity);
        let mapping = await repository.findOne({
            where: { provider, entityType, externalId },
        });
        mapping ??= repository.create({
            provider,
            entityType,
            externalId,
            localId,
            externalRevision: null,
            metadata: null,
            lastSeenAt: new Date(),
        });
        mapping.localId = localId;
        mapping.externalRevision = item.externalRevision?.trim() || null;
        mapping.lastSeenAt = new Date();
        mapping.metadata = item.sourceUpdatedAt
            ? { sourceUpdatedAt: item.sourceUpdatedAt }
            : null;
        await repository.save(mapping);
    }

    private normalizeInn(value: string) {
        const normalized = value.replace(/\D/g, '');
        if (![10, 12].includes(normalized.length))
            throw new BadRequestException(
                'Organization INN must contain 10 or 12 digits',
            );
        return normalized;
    }

    private normalizeOptionalDigits(value?: string) {
        const normalized = value?.replace(/\D/g, '') ?? '';
        return normalized || null;
    }

    private normalizePhone(value: string) {
        const digits = value.replace(/\D/g, '');
        if (digits.length === 10) return `+7${digits}`;
        if (digits.length === 11 && digits.startsWith('8'))
            return `+7${digits.slice(1)}`;
        if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
        return null;
    }

    private toDate(value?: string) {
        return value ? new Date(value) : null;
    }

    private assetSource(provider: IntegrationProvider): AssetDataSource {
        return provider === 'atol_connect' ? 'atol_api' : 'ofd_api';
    }

    private opportunityPriority(severity?: string) {
        if (severity === 'urgent') return 'urgent' as const;
        if (severity === 'high') return 'high' as const;
        if (severity === 'info' || severity === 'low') return 'low' as const;
        return 'normal' as const;
    }

    private maxPriority(
        current: ServiceOpportunityEntity['priority'],
        next: ServiceOpportunityEntity['priority'],
    ) {
        const order = { low: 0, normal: 1, high: 2, urgent: 3 };
        return order[next] > order[current] ? next : current;
    }

    private sanitizeMetadata(value?: Record<string, unknown>) {
        if (!value) return null;
        const blocked = /token|secret|password|authorization|cookie|url/i;
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !blocked.test(key))
                .map(([key, item]) => [
                    key,
                    typeof item === 'string' ? item.slice(0, 1000) : item,
                ]),
        );
    }

    private safeError(error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : 'Integration import failed';
        return message
            .replace(/https?:\/\/\S+/gi, '[url removed]')
            .slice(0, 1000);
    }

    private async recordImportError(
        run: IntegrationRunEntity,
        entityType: string,
        error: unknown,
    ) {
        try {
            await this.errors.save(
                this.errors.create({
                    integrationRunId: run.id,
                    provider: run.provider,
                    entityType: entityType.slice(0, 255),
                    externalId: null,
                    code:
                        error instanceof Error
                            ? error.name.slice(0, 255)
                            : 'IntegrationError',
                    message: this.safeError(error),
                }),
            );
        } catch {
            // The original import failure remains the primary error.
        }
    }
}
