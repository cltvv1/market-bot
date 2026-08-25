import { randomUUID } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditService } from 'src/audit/audit.service';
import { FilesService } from 'src/files/files.service';
import {
    MESSENGER_SERVICE,
    type MessengerService,
} from 'src/messenger/messenger.types';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { EquipmentKitEntity } from 'src/assets/entities/equipment-kit.entity';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from './entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from './entities/registration-data-request.entity';
import {
    REGISTRATION_REQUIREMENT_KINDS,
    type OfdProvisionMode,
    type RegistrationDataSource,
    type RegistrationReadiness,
    type RegistrationRequirementKind,
} from './registration.types';

export interface RegistrationClientIdentity {
    platform: UserPlatform;
    chatId: string;
    userId?: number;
}

type RegistrationHandoffResult =
    | {
          denied: true;
          requirements: Array<{
              kind: RegistrationRequirementKind;
              status: RegistrationRequirementEntity['status'];
          }>;
      }
    | { denied: false; registration: RegistrationRequestEntity };

const labels: Record<RegistrationRequirementKind, string> = {
    kkt_serial: 'заводской номер ККТ',
    fiscal_drive_serial: 'номер фискального накопителя',
    ofd_code: 'код активации ОФД',
};

export function computeRegistrationReadiness(
    mode: OfdProvisionMode,
    statuses: Array<RegistrationRequirementEntity['status']>,
): RegistrationReadiness {
    if (mode === 'clarification_required') return 'incomplete';
    if (statuses.some((status) => status === 'requested'))
        return 'awaiting_customer';
    if (statuses.some((status) => status === 'missing')) return 'incomplete';
    if (statuses.some((status) => status === 'provided'))
        return 'awaiting_verification';
    return statuses.length === REGISTRATION_REQUIREMENT_KINDS.length &&
        statuses.every(
            (status) => status === 'verified' || status === 'not_required',
        )
        ? 'ready'
        : 'incomplete';
}

@Injectable()
export class RegistrationReadinessService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrations: Repository<RegistrationRequestEntity>,
        @InjectRepository(RegistrationRequirementEntity)
        private readonly requirements: Repository<RegistrationRequirementEntity>,
        @InjectRepository(RegistrationEvidenceEntity)
        private readonly evidence: Repository<RegistrationEvidenceEntity>,
        @InjectRepository(RegistrationDataRequestEntity)
        private readonly requests: Repository<RegistrationDataRequestEntity>,
        @InjectRepository(EquipmentKitEntity)
        private readonly kits: Repository<EquipmentKitEntity>,
        private readonly files: FilesService,
        private readonly audit: AuditService,
        @Inject(MESSENGER_SERVICE) private readonly messenger: MessengerService,
    ) {}

    async initialize(registrationId: number) {
        await this.dataSource.transaction(async (manager) => {
            for (const kind of REGISTRATION_REQUIREMENT_KINDS) {
                await manager.query(
                    `INSERT INTO "registration_requirements" ("registrationId","kind","status","version") VALUES ($1,$2,'missing',1) ON CONFLICT ("registrationId","kind") DO NOTHING`,
                    [registrationId, kind],
                );
            }
            await this.audit.record(
                {
                    actorType: 'system',
                    action: 'registration.checklist.initialized',
                    targetType: 'registration',
                    targetId: registrationId,
                },
                manager,
            );
        });
        return this.recompute(registrationId);
    }

    async details(registrationId: number) {
        const registration = await this.registrations.findOne({
            where: { id: registrationId },
        });
        if (!registration)
            throw new NotFoundException('Registration was not found');
        await this.initializeIfMissing(registrationId);
        const [requirements, evidence, dataRequests] = await Promise.all([
            this.requirements.find({
                where: { registrationId },
                order: { id: 'ASC' },
            }),
            this.evidence.find({
                where: { registrationId, removedAt: IsNull() },
                relations: { storedFile: true },
                order: { id: 'ASC' },
            }),
            this.requests.find({
                where: { registrationId },
                order: { id: 'DESC' },
            }),
        ]);
        return { registration, requirements, evidence, dataRequests };
    }

    async clientDetails(
        identity: RegistrationClientIdentity,
        registrationId: number,
    ) {
        const details = await this.details(registrationId);
        this.assertOwner(details.registration, identity);
        return {
            registration: {
                id: details.registration.id,
                status: details.registration.status,
                readiness: details.registration.readiness,
                ofdProvisionMode: details.registration.ofdProvisionMode,
                createdAt: details.registration.createdAt,
                updatedAt: details.registration.updatedAt,
            },
            requirements: details.requirements.map((item) => ({
                id: item.id,
                kind: item.kind,
                status: item.status,
                value:
                    item.kind === 'ofd_code' && item.value
                        ? this.maskCode(item.value)
                        : item.value,
                source: item.source,
                requestedAt: item.requestedAt,
                providedAt: item.providedAt,
                verifiedAt: item.verifiedAt,
            })),
            evidence: details.evidence
                .filter((item) => item.visibility === 'customer')
                .map((item) => ({
                    id: item.id,
                    requirementId: item.requirementId,
                    fileName: item.storedFile.originalName,
                    createdAt: item.createdAt,
                })),
            dataRequests: details.dataRequests.map((item) => ({
                id: item.id,
                requirementId: item.requirementId,
                requestText: item.requestText,
                status: item.status,
                createdAt: item.createdAt,
                answeredAt: item.answeredAt,
            })),
        };
    }

    getEvidence(id: number) {
        return this.evidence.findOne({
            where: { id, removedAt: IsNull() },
            relations: { storedFile: true },
        });
    }

    async removeEvidence(
        registrationId: number,
        evidenceId: number,
        staffId: number,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOneBy(
                RegistrationRequestEntity,
                { id: registrationId },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            const item = await manager.findOne(RegistrationEvidenceEntity, {
                where: { id: evidenceId, registrationId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!item || item.removedAt)
                throw new NotFoundException('Evidence was not found');
            item.removedAt = new Date();
            await manager.save(item);
            if (item.requirementId) {
                const requirement = await manager.findOne(
                    RegistrationRequirementEntity,
                    {
                        where: { id: item.requirementId },
                        lock: { mode: 'pessimistic_write' },
                    },
                );
                const remaining = await manager.count(
                    RegistrationEvidenceEntity,
                    {
                        where: {
                            requirementId: item.requirementId,
                            removedAt: IsNull(),
                        },
                    },
                );
                if (
                    requirement &&
                    remaining === 0 &&
                    !requirement.value &&
                    requirement.source === 'customer_photo'
                ) {
                    requirement.status = 'missing';
                    requirement.source = null;
                    requirement.providedAt = null;
                    await manager.save(requirement);
                    await this.recomputeWithManager(manager, registration);
                }
            }
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.evidence.removed',
                    targetType: 'registration_evidence',
                    targetId: item.id,
                    metadata: { registrationId },
                },
                manager,
            );
            return item;
        });
    }

    async linkEvidence(
        registrationId: number,
        evidenceId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const source = await manager.findOneBy(RegistrationEvidenceEntity, {
                id: evidenceId,
                registrationId,
                removedAt: IsNull(),
            });
            if (!source) throw new NotFoundException('Evidence was not found');
            const requirement = await this.lockRequirement(
                manager,
                registrationId,
                kind,
            );
            let link = await manager.findOneBy(RegistrationEvidenceEntity, {
                requirementId: requirement.id,
                storedFileId: source.storedFileId,
            });
            if (link) {
                link.removedAt = null;
            } else {
                link = manager.create(RegistrationEvidenceEntity, {
                    registrationId,
                    requirementId: requirement.id,
                    storedFileId: source.storedFileId,
                    kind: source.kind,
                    visibility: source.visibility,
                    uploadedByActorType: 'staff',
                    uploadedByActorId: staffId,
                    comment: 'Linked to another registration requirement',
                });
            }
            await manager.save(link);
            if (!['verified', 'not_required'].includes(requirement.status)) {
                requirement.status = 'provided';
                requirement.source = requirement.source ?? 'customer_photo';
                requirement.providedAt = requirement.providedAt ?? new Date();
                await manager.save(requirement);
            }
            const registration = await manager.findOneByOrFail(
                RegistrationRequestEntity,
                { id: registrationId },
            );
            await this.recomputeWithManager(manager, registration);
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.evidence.linked',
                    targetType: 'registration_evidence',
                    targetId: link.id,
                    metadata: { registrationId, kind },
                },
                manager,
            );
            return link;
        });
    }

    async revokeVerification(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        reason: string,
    ) {
        if (!reason.trim()) throw new BadRequestException('Reason is required');
        await this.changeByStaff(
            registrationId,
            kind,
            staffId,
            (requirement) => {
                requirement.status = 'provided';
                requirement.verifiedAt = null;
                requirement.verifiedByStaffId = null;
                requirement.operatorComment = reason.trim();
                return 'registration.verification.revoked';
            },
        );
        return this.requestData(registrationId, kind, staffId, reason);
    }

    async provideValue(
        identity: RegistrationClientIdentity,
        registrationId: number,
        kind: RegistrationRequirementKind,
        value: string,
    ) {
        const cleaned = value.trim();
        if (!cleaned) throw new BadRequestException('Value is required');
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOne(
                RegistrationRequestEntity,
                {
                    where: { id: registrationId },
                    lock: { mode: 'pessimistic_write' },
                },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            this.assertOwner(registration, identity);
            const requirement = await this.lockRequirement(
                manager,
                registrationId,
                kind,
            );
            if (
                requirement.status === 'verified' ||
                requirement.status === 'not_required'
            )
                throw new ConflictException(
                    'Verified requirement cannot be changed by customer',
                );
            requirement.value = cleaned;
            requirement.source = 'customer_input';
            requirement.status = 'provided';
            requirement.providedAt = new Date();
            requirement.verifiedAt = null;
            requirement.verifiedByStaffId = null;
            await manager.save(requirement);
            await this.answerOpenRequest(manager, requirement.id);
            await this.audit.record(
                {
                    actorType: 'customer',
                    actorCustomerId: registration.userId ?? undefined,
                    action: 'registration.value.provided',
                    targetType: 'registration_requirement',
                    targetId: requirement.id,
                    metadata: { kind },
                },
                manager,
            );
            await this.recomputeWithManager(manager, registration);
            return requirement;
        });
    }

    async provideStaffValue(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        value: string,
        source: 'operator_input' | 'sold_by_vitma' = 'operator_input',
    ) {
        const cleaned = value.trim();
        if (!cleaned) throw new BadRequestException('Value is required');
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOne(
                RegistrationRequestEntity,
                {
                    where: { id: registrationId },
                    lock: { mode: 'pessimistic_write' },
                },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            const requirement = await this.lockRequirement(
                manager,
                registrationId,
                kind,
            );
            requirement.value = cleaned;
            requirement.source = source;
            requirement.status = 'provided';
            requirement.providedAt = new Date();
            requirement.verifiedAt = null;
            requirement.verifiedByStaffId = null;
            await manager.save(requirement);
            await this.answerOpenRequest(manager, requirement.id);
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.value.provided_by_staff',
                    targetType: 'registration_requirement',
                    targetId: requirement.id,
                    metadata: { kind, source },
                },
                manager,
            );
            await this.recomputeWithManager(manager, registration);
            return requirement;
        });
    }

    async uploadEvidence(
        identity: RegistrationClientIdentity,
        registrationId: number,
        kind: RegistrationRequirementKind,
        file: { buffer: Buffer; fileName?: string; mimeType?: string },
    ) {
        const registration = await this.assertEvidenceUploadAccess(
            identity,
            registrationId,
        );
        await this.initializeIfMissing(registrationId);
        const requirement = await this.requirements.findOneByOrFail({
            registrationId,
            kind,
        });
        if (
            requirement.status === 'verified' ||
            requirement.status === 'not_required'
        )
            throw new ConflictException(
                'Verified requirement cannot be changed by customer',
            );
        const stored = await this.files.saveBuffer({
            purpose: 'registration-evidence',
            buffer: file.buffer,
            originalName: file.fileName,
            mimeType: file.mimeType,
            createdByCustomerId: registration.userId ?? undefined,
            metadata: { registrationId, requirementKind: kind },
        });
        try {
            return await this.dataSource.transaction(async (manager) => {
                const locked = await this.lockRequirement(
                    manager,
                    registrationId,
                    kind,
                );
                if (
                    locked.status === 'verified' ||
                    locked.status === 'not_required'
                )
                    throw new ConflictException(
                        'Verified requirement cannot be changed by customer',
                    );
                const link = manager.create(RegistrationEvidenceEntity, {
                    registrationId,
                    requirementId: locked.id,
                    storedFileId: stored.id,
                    kind: stored.mimeType.startsWith('image/')
                        ? 'customer_photo'
                        : 'customer_document',
                    visibility: 'customer',
                    uploadedByActorType: 'customer',
                    uploadedByActorId: registration.userId ?? null,
                });
                await manager.save(link);
                locked.source = 'customer_photo';
                locked.status = 'provided';
                locked.providedAt = new Date();
                await manager.save(locked);
                await this.answerOpenRequest(manager, locked.id);
                await this.audit.record(
                    {
                        actorType: 'customer',
                        actorCustomerId: registration.userId ?? undefined,
                        action: 'registration.evidence.uploaded',
                        targetType: 'registration_requirement',
                        targetId: locked.id,
                        metadata: { kind, storedFileId: stored.id },
                    },
                    manager,
                );
                const current = await manager.findOneByOrFail(
                    RegistrationRequestEntity,
                    { id: registrationId },
                );
                await this.recomputeWithManager(manager, current);
                return link;
            });
        } catch (error) {
            await this.files.logicalDelete(stored.id).catch(() => undefined);
            throw error;
        }
    }

    async assertEvidenceUploadAccess(
        identity: RegistrationClientIdentity,
        registrationId: number,
    ) {
        const registration = await this.registrations.findOne({
            where: { id: registrationId },
        });
        if (!registration) {
            throw new NotFoundException('Registration was not found');
        }
        this.assertOwner(registration, identity);
        return registration;
    }

    async requestData(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        text?: string,
    ) {
        const result = await this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOne(
                RegistrationRequestEntity,
                {
                    where: { id: registrationId },
                    lock: { mode: 'pessimistic_write' },
                },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            const requirement = await this.lockRequirement(
                manager,
                registrationId,
                kind,
            );
            const existing = await manager.findOne(
                RegistrationDataRequestEntity,
                {
                    where: {
                        requirementId: requirement.id,
                        closedAt: IsNull(),
                    },
                },
            );
            if (existing) {
                const shouldRetry = existing.status === 'delivery_failed';
                if (shouldRetry) {
                    existing.status = 'open';
                    existing.deliveryError = null;
                    await manager.save(existing);
                }
                return {
                    registration,
                    requirement,
                    request: existing,
                    created: false,
                    deliver: shouldRetry,
                };
            }
            requirement.status = 'requested';
            requirement.requestedAt = new Date();
            requirement.verifiedAt = null;
            requirement.verifiedByStaffId = null;
            await manager.save(requirement);
            const request = await manager.save(
                manager.create(RegistrationDataRequestEntity, {
                    registrationId,
                    requirementId: requirement.id,
                    requestedByStaffId: staffId,
                    requestText: (
                        text?.trim() ||
                        `Пожалуйста, предоставьте ${labels[kind]}.`
                    ).slice(0, 2000),
                    targetChannel: registration.platform,
                    responseToken: randomUUID(),
                    status:
                        registration.platform === 'web' ? 'delivered' : 'open',
                    deliveredAt:
                        registration.platform === 'web' ? new Date() : null,
                }),
            );
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.data.requested',
                    targetType: 'registration_requirement',
                    targetId: requirement.id,
                    metadata: { kind, channel: registration.platform },
                },
                manager,
            );
            await this.recomputeWithManager(manager, registration);
            return {
                registration,
                requirement,
                request,
                created: true,
                deliver: registration.platform !== 'web',
            };
        });
        if (!result.deliver || result.registration.platform === 'web')
            return result.request;
        try {
            await this.messenger.sendMessage(
                result.registration.chatId,
                result.request.requestText,
                {
                    platform: result.registration.platform,
                    inlineKeyboard: {
                        buttons: [
                            {
                                text: 'Передать данные',
                                callbackData: `regdata:${result.request.responseToken}`,
                            },
                        ],
                        columns: 1,
                    },
                },
            );
            result.request.status = 'delivered';
            result.request.deliveredAt = new Date();
            await this.requests.save(result.request);
            await this.audit.record({
                actorType: 'system',
                action: 'registration.data_request.delivery_success',
                targetType: 'registration_data_request',
                targetId: result.request.id,
                metadata: { channel: result.registration.platform },
            });
        } catch {
            result.request.status = 'delivery_failed';
            result.request.deliveryError = 'Messenger delivery failed';
            await this.requests.save(result.request);
            await this.audit.record({
                actorType: 'system',
                action: 'registration.data_request.delivery_failure',
                targetType: 'registration_data_request',
                targetId: result.request.id,
                result: 'failure',
                metadata: { channel: result.registration.platform },
            });
        }
        return result.request;
    }

    async activateRequest(identity: RegistrationClientIdentity, token: string) {
        const request = await this.requests.findOne({
            where: { responseToken: token },
            relations: { registration: true },
        });
        if (
            !request ||
            request.closedAt ||
            ['answered', 'closed'].includes(request.status)
        )
            throw new BadRequestException('Data request is no longer active');
        this.assertOwner(request.registration, identity);
        request.activatedAt = new Date();
        await this.requests.save(request);
        return request;
    }

    async activeRequest(identity: RegistrationClientIdentity) {
        const candidates = await this.requests
            .createQueryBuilder('request')
            .innerJoinAndSelect('request.registration', 'registration')
            .innerJoinAndSelect('request.requirement', 'requirement')
            .where('request.closedAt IS NULL')
            .andWhere(
                "request.status IN ('open','delivered','delivery_failed')",
            )
            .andWhere(
                'registration.chatId = :chatId AND registration.platform = :platform',
                identity,
            )
            .orderBy('request.activatedAt', 'DESC', 'NULLS LAST')
            .addOrderBy('request.createdAt', 'DESC')
            .getMany();
        if (!candidates.length) return null;
        const activated = candidates.find((item) => item.activatedAt);
        if (activated) return activated;
        return candidates.length === 1 ? candidates[0] : null;
    }

    async provideActiveText(
        identity: RegistrationClientIdentity,
        value: string,
    ) {
        const request = await this.activeRequest(identity);
        if (!request) return null;
        await this.provideValue(
            identity,
            request.registrationId,
            request.requirement.kind,
            value,
        );
        return request;
    }

    async provideActiveFile(
        identity: RegistrationClientIdentity,
        file: { buffer: Buffer; fileName?: string; mimeType?: string },
    ) {
        const request = await this.activeRequest(identity);
        if (!request) return null;
        await this.uploadEvidence(
            identity,
            request.registrationId,
            request.requirement.kind,
            file,
        );
        return request;
    }

    verify(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        comment?: string,
    ) {
        return this.changeByStaff(
            registrationId,
            kind,
            staffId,
            async (requirement, manager) => {
                if (!requirement.value)
                    throw new BadRequestException(
                        'Canonical value is required before verification',
                    );
                if (!requirement.source)
                    throw new BadRequestException(
                        'Data source is required before verification',
                    );
                requirement.status = 'verified';
                requirement.verifiedAt = new Date();
                requirement.verifiedByStaffId = staffId;
                requirement.operatorComment = comment?.trim() || null;
                requirement.notRequiredReason = null;
                await this.answerOpenRequest(manager, requirement.id, true);
                return 'registration.value.verified';
            },
        );
    }

    async markNotRequired(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        reason: string,
    ) {
        if (!reason.trim()) throw new BadRequestException('Reason is required');
        return this.changeByStaff(
            registrationId,
            kind,
            staffId,
            async (requirement, manager) => {
                requirement.status = 'not_required';
                requirement.notRequiredReason = reason.trim();
                requirement.verifiedAt = new Date();
                requirement.verifiedByStaffId = staffId;
                await this.answerOpenRequest(manager, requirement.id, true);
                return 'registration.requirement.not_required';
            },
        );
    }

    async setOfdMode(
        registrationId: number,
        mode: OfdProvisionMode,
        staffId: number,
        reason?: string,
    ) {
        if (mode === 'not_applicable' && !reason?.trim())
            throw new BadRequestException(
                'Reason is required for not applicable OFD',
            );
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOne(
                RegistrationRequestEntity,
                {
                    where: { id: registrationId },
                    lock: { mode: 'pessimistic_write' },
                },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            registration.ofdProvisionMode = mode;
            const ofd = await this.lockRequirement(
                manager,
                registrationId,
                'ofd_code',
            );
            if (mode === 'not_applicable') {
                ofd.status = 'not_required';
                ofd.notRequiredReason = reason!.trim();
                ofd.verifiedAt = new Date();
                ofd.verifiedByStaffId = staffId;
            } else if (ofd.status === 'not_required') {
                ofd.status = ofd.value ? 'provided' : 'missing';
                ofd.notRequiredReason = null;
                ofd.verifiedAt = null;
                ofd.verifiedByStaffId = null;
            }
            await manager.save(ofd);
            await this.recomputeWithManager(manager, registration);
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.ofd_mode.changed',
                    targetType: 'registration',
                    targetId: registrationId,
                    metadata: { mode },
                },
                manager,
            );
            return registration;
        });
    }

    async useEquipmentKit(
        registrationId: number,
        kitId: number,
        staffId: number,
    ) {
        const kit = await this.kits.findOneBy({ id: kitId });
        if (
            !kit ||
            (kit.registrationRequestId &&
                kit.registrationRequestId !== registrationId)
        )
            throw new BadRequestException('Equipment kit is unavailable');
        const values: Array<
            [RegistrationRequirementKind, string | null, RegistrationDataSource]
        > = [
            ['kkt_serial', kit.cashRegisterSerial, 'internal_registry'],
            ['fiscal_drive_serial', kit.fiscalDriveSerial, 'internal_registry'],
            ['ofd_code', kit.ofdActivationCode, 'sold_by_vitma'],
        ];
        await this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOneByOrFail(
                RegistrationRequestEntity,
                { id: registrationId },
            );
            registration.equipmentKitId = kitId;
            kit.registrationRequestId = registrationId;
            kit.status = 'linked';
            await manager.save([registration, kit]);
            for (const [kind, value, source] of values)
                if (value?.trim()) {
                    const requirement = await this.lockRequirement(
                        manager,
                        registrationId,
                        kind,
                    );
                    requirement.value = value.trim();
                    requirement.source = source;
                    requirement.status = 'provided';
                    requirement.providedAt = new Date();
                    await manager.save(requirement);
                }
            await this.recomputeWithManager(manager, registration);
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action: 'registration.value.loaded_from_internal_registry',
                    targetType: 'registration',
                    targetId: registrationId,
                    metadata: { equipmentKitId: kitId },
                },
                manager,
            );
        });
        return this.details(registrationId);
    }

    async handoff(
        registrationId: number,
        staffId: number,
        engineerId?: number,
    ) {
        return this.handoffWithAction(
            registrationId,
            staffId,
            undefined,
            engineerId,
        );
    }

    async handoffWithAction(
        registrationId: number,
        staffId: number,
        onAllowed?: (
            registration: RegistrationRequestEntity,
            manager: EntityManager,
        ) => Promise<void>,
        engineerId?: number,
    ) {
        const result = await this.dataSource.transaction(async (manager) => {
            const handoff = await this.handoffWithManager(
                manager,
                registrationId,
                staffId,
                engineerId,
            );
            if (!handoff.denied && onAllowed) {
                await onAllowed(handoff.registration, manager);
            }
            return handoff;
        });
        if (result.denied) {
            await this.audit.record({
                actorType: 'staff',
                actorStaffId: staffId,
                action: 'registration.handoff.denied',
                targetType: 'registration',
                targetId: registrationId,
                result: 'denied',
                metadata: {
                    pendingKinds: result.requirements.map((item) => item.kind),
                },
            });
            throw new ConflictException({
                message: 'Registration is not ready',
                requirements: result.requirements,
            });
        }
        return result.registration;
    }

    async handoffWithManager(
        manager: EntityManager,
        registrationId: number,
        staffId: number,
        engineerId?: number,
    ): Promise<RegistrationHandoffResult> {
        const registration = await manager.findOne(RegistrationRequestEntity, {
            where: { id: registrationId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!registration)
            throw new NotFoundException('Registration was not found');
        await this.recomputeWithManager(manager, registration);
        if (registration.readiness !== 'ready') {
            const pending = await manager.find(RegistrationRequirementEntity, {
                where: { registrationId },
            });
            return {
                denied: true,
                requirements: pending
                    .filter(
                        (item) =>
                            !['verified', 'not_required'].includes(item.status),
                    )
                    .map((item) => ({
                        kind: item.kind,
                        status: item.status,
                    })),
            };
        }
        if (registration.handedOffAt) return { denied: false, registration };
        if (engineerId) {
            const rows = await manager.query<Array<{ id: number }>>(
                `SELECT u.id FROM admin_users u JOIN admin_user_roles r ON r."userId"=u.id WHERE u.id=$1 AND u."isActive"=true AND r.role='engineer'`,
                [engineerId],
            );
            if (!rows.length)
                throw new BadRequestException('Active engineer was not found');
        }
        registration.assignedEngineerId =
            engineerId ?? registration.assignedEngineerId;
        registration.handedOffAt = new Date();
        registration.status = 'processed';
        await manager.save(registration);
        await this.audit.record(
            {
                actorType: 'staff',
                actorStaffId: staffId,
                action: 'registration.handoff.allowed',
                targetType: 'registration',
                targetId: registrationId,
                metadata: {
                    assignedEngineerId: registration.assignedEngineerId,
                },
            },
            manager,
        );
        return { denied: false, registration };
    }

    async recompute(registrationId: number) {
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOneByOrFail(
                RegistrationRequestEntity,
                { id: registrationId },
            );
            await this.recomputeWithManager(manager, registration);
            return registration.readiness;
        });
    }

    private async changeByStaff(
        registrationId: number,
        kind: RegistrationRequirementKind,
        staffId: number,
        mutate: (
            requirement: RegistrationRequirementEntity,
            manager: EntityManager,
        ) => Promise<string> | string,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const registration = await manager.findOne(
                RegistrationRequestEntity,
                {
                    where: { id: registrationId },
                    lock: { mode: 'pessimistic_write' },
                },
            );
            if (!registration)
                throw new NotFoundException('Registration was not found');
            const requirement = await this.lockRequirement(
                manager,
                registrationId,
                kind,
            );
            const action = await mutate(requirement, manager);
            await manager.save(requirement);
            await this.recomputeWithManager(manager, registration);
            await this.audit.record(
                {
                    actorType: 'staff',
                    actorStaffId: staffId,
                    action,
                    targetType: 'registration_requirement',
                    targetId: requirement.id,
                    metadata: { kind },
                },
                manager,
            );
            return requirement;
        });
    }

    private async initializeIfMissing(registrationId: number) {
        if (
            (await this.requirements.countBy({ registrationId })) <
            REGISTRATION_REQUIREMENT_KINDS.length
        )
            await this.initialize(registrationId);
    }

    private async lockRequirement(
        manager: EntityManager,
        registrationId: number,
        kind: RegistrationRequirementKind,
    ) {
        let requirement = await manager.findOne(RegistrationRequirementEntity, {
            where: { registrationId, kind },
            lock: { mode: 'pessimistic_write' },
        });
        if (!requirement) {
            await manager.query(
                `INSERT INTO "registration_requirements" ("registrationId","kind","status","version") VALUES ($1,$2,'missing',1) ON CONFLICT DO NOTHING`,
                [registrationId, kind],
            );
            requirement = await manager.findOne(RegistrationRequirementEntity, {
                where: { registrationId, kind },
                lock: { mode: 'pessimistic_write' },
            });
        }
        if (!requirement)
            throw new NotFoundException(
                'Registration requirement was not found',
            );
        return requirement;
    }

    private async recomputeWithManager(
        manager: EntityManager,
        registration: RegistrationRequestEntity,
    ) {
        const items: RegistrationRequirementEntity[] = await manager.find(
            RegistrationRequirementEntity,
            { where: { registrationId: registration.id } },
        );
        const readiness = computeRegistrationReadiness(
            registration.ofdProvisionMode,
            items.map((item) => item.status),
        );
        if (registration.readiness !== readiness)
            await this.audit.record(
                {
                    actorType: 'system',
                    action: 'registration.readiness.changed',
                    targetType: 'registration',
                    targetId: registration.id,
                    metadata: { from: registration.readiness, to: readiness },
                },
                manager,
            );
        registration.readiness = readiness;
        registration.readinessUpdatedAt = new Date();
        await manager.save(registration);
    }

    private async answerOpenRequest(
        manager: EntityManager,
        requirementId: number,
        close = false,
    ) {
        const request = await manager.findOne(RegistrationDataRequestEntity, {
            where: { requirementId, closedAt: IsNull() },
            lock: { mode: 'pessimistic_write' },
        });
        if (!request) return;
        request.status = close ? 'closed' : 'answered';
        request.answeredAt = request.answeredAt ?? new Date();
        if (close) request.closedAt = new Date();
        await manager.save(request);
    }

    private assertOwner(
        registration: RegistrationRequestEntity,
        identity: RegistrationClientIdentity,
    ) {
        if (
            registration.chatId !== identity.chatId ||
            registration.platform !== identity.platform
        )
            throw new NotFoundException('Registration was not found');
    }

    private maskCode(value: string) {
        return value.length <= 4
            ? '****'
            : `${'*'.repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
    }
}
