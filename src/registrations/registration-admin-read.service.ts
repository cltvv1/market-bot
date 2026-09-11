import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { EquipmentKitEntity } from 'src/assets/entities/equipment-kit.entity';
import { AuditEventEntity } from 'src/audit/entities/audit-event.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from './entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from './entities/registration-data-request.entity';
import {
    registrationActionReason,
    registrationInputFields,
    registrationPermissions,
    registrationPrecondition,
    registrationRequirementActions,
    registrationRootActions,
    type RegistrationAdminActionId,
} from './registration-admin-policy';
import { computeRegistrationReadiness } from './registration-readiness.service';
import type {
    RegistrationRequirementKind,
    RegistrationReadiness,
} from './registration.types';

export interface RegistrationAdminQuery {
    status?: 'new' | 'in_work' | 'processed' | 'all';
    platform?: 'web' | 'telegram' | 'max';
    priority?: RegistrationRequestEntity['priority'];
    readiness?: RegistrationReadiness;
    page?: number;
    limit?: number;
}

const historyLabels: Record<string, string> = {
    'registration.checklist.initialized': 'Создан перечень требований',
    'registration.value.provided': 'Клиент передал значение',
    'registration.value.provided_by_staff': 'Сотрудник внёс значение',
    'registration.value.verified': 'Значение проверено',
    'registration.verification.revoked': 'Проверка отозвана',
    'registration.requirement.not_required': 'Требование признано неприменимым',
    'registration.evidence.uploaded': 'Получено подтверждение',
    'registration.evidence.linked': 'Подтверждение связано с требованием',
    'registration.evidence.removed': 'Связь с подтверждением удалена',
    'registration.data.requested': 'Запрошены данные клиента',
    'registration.data_request.delivery_success': 'Запрос отправлен в канал',
    'registration.data_request.delivery_failure': 'Не удалось отправить запрос',
    'registration.readiness.changed': 'Комплектность обновлена',
    'registration.ofd_mode.changed': 'Изменён способ подключения ОФД',
    'registration.value.loaded_from_internal_registry':
        'Данные загружены из комплекта',
    'registration.handoff.allowed': 'Регистрация передана внутри компании',
    'registration.handoff.denied':
        'Передача отклонена: не хватает проверенных данных',
    'registration.final_pdf.generated': 'Подготовлен финальный PDF',
    'registration.operator_state.update': 'Изменено состояние обработки',
};
const applicationFields = [
    'orgName',
    'ogrn',
    'innKpp',
    'urAdress',
    'kktAdress',
    'kktName',
    'phone',
    'phoneToCall',
    'email',
    'nds',
    'excise',
    'markirovka',
    'services',
    'strictReporting',
    'taxSystem',
    'kktModel',
    'bankReqs',
    'ofd',
] as const;

@Injectable()
export class RegistrationAdminReadService {
    constructor(private readonly dataSource: DataSource) {}

    async authorize(
        manager: EntityManager,
        admin: Pick<AdminPrincipal, 'id'>,
        id: number,
        update = false,
    ) {
        const permissions = await registrationPermissions(manager, admin.id);
        if (update && !permissions.includes('registrations.update'))
            throw new ForbiddenException('Insufficient permissions');
        if (
            !permissions.includes('registrations.read') &&
            !permissions.includes('registrations.read.assigned')
        )
            throw new ForbiddenException('Insufficient permissions');
        const registration = await manager.findOne(RegistrationRequestEntity, {
            where: {
                id,
                ...(permissions.includes('registrations.read')
                    ? {}
                    : { assignedEngineerId: admin.id }),
            },
        });
        if (!registration)
            throw new NotFoundException('Registration was not found');
        return { registration, permissions };
    }

    list(admin: AdminPrincipal, query: RegistrationAdminQuery) {
        return this.dataSource.transaction(
            'REPEATABLE READ',
            async (manager) => {
                const permissions = await registrationPermissions(
                    manager,
                    admin.id,
                );
                if (
                    !permissions.includes('registrations.read') &&
                    !permissions.includes('registrations.read.assigned')
                )
                    throw new ForbiddenException('Insufficient permissions');
                const page = query.page ?? 1;
                const limit = query.limit ?? 25;
                const qb = manager
                    .getRepository(RegistrationRequestEntity)
                    .createQueryBuilder('registration')
                    .select([
                        'registration.id',
                        'registration.orgName',
                        'registration.innKpp',
                        'registration.kktModel',
                        'registration.platform',
                        'registration.status',
                        'registration.readiness',
                        'registration.priority',
                        'registration.assignedEngineerId',
                        'registration.createdAt',
                    ])
                    .where('registration.status IN (:...statuses)', {
                        statuses:
                            query.status === 'all'
                                ? ['new', 'in_work', 'processed']
                                : [query.status ?? 'new'],
                    });
                if (!permissions.includes('registrations.read'))
                    qb.andWhere('registration.assignedEngineerId = :staffId', {
                        staffId: admin.id,
                    });
                for (const key of [
                    'platform',
                    'priority',
                    'readiness',
                ] as const)
                    if (query[key])
                        qb.andWhere(`registration.${key} = :${key}`, {
                            [key]: query[key],
                        });
                const total = await qb.getCount();
                const rows = await qb
                    .orderBy('registration.createdAt', 'DESC')
                    .addOrderBy('registration.id', 'DESC')
                    .skip((page - 1) * limit)
                    .take(limit)
                    .getMany();
                const staff = await this.identities(
                    manager,
                    rows.map((item) => item.assignedEngineerId),
                );
                return {
                    items: rows.map((item) => ({
                        id: item.id,
                        orgName: item.orgName ?? null,
                        innKpp: item.innKpp ?? null,
                        kktModel: item.kktModel ?? null,
                        platform: item.platform,
                        status: item.status,
                        readiness: item.readiness,
                        priority: item.priority,
                        assignedEngineer:
                            staff.get(item.assignedEngineerId) ?? null,
                        createdAt: item.createdAt,
                    })),
                    page,
                    limit,
                    total,
                    hasNext: page * limit < total,
                };
            },
        );
    }

    details(admin: Pick<AdminPrincipal, 'id'>, id: number) {
        return this.dataSource.transaction(
            'REPEATABLE READ',
            async (manager) => {
                const { registration, permissions } = await this.authorize(
                    manager,
                    admin,
                    id,
                );
                const requirements = await manager.find(
                    RegistrationRequirementEntity,
                    { where: { registrationId: id }, order: { id: 'ASC' } },
                );
                const evidence = await manager.find(
                    RegistrationEvidenceEntity,
                    {
                        where: { registrationId: id, removedAt: IsNull() },
                        relations: { storedFile: true },
                        order: { id: 'ASC' },
                    },
                );
                const requests = await manager.find(
                    RegistrationDataRequestEntity,
                    { where: { registrationId: id }, order: { id: 'DESC' } },
                );
                const pdf = registration.pdfFileId
                    ? await manager.findOneBy(StoredFileEntity, {
                          id: registration.pdfFileId,
                      })
                    : null;
                const staff = await this.identities(manager, [
                    registration.assignedEngineerId,
                    ...requirements.map((item) => item.verifiedByStaffId),
                ]);
                const action = (
                    actionId: RegistrationAdminActionId,
                    kind?: RegistrationRequirementKind,
                ) => {
                    const reason = registrationActionReason(
                        actionId,
                        registration,
                        requirements,
                        kind,
                    );
                    return {
                        id: actionId,
                        allowed: !reason,
                        reason: reason?.reason ?? null,
                        reasonCode: reason?.reasonCode ?? null,
                        inputFields: registrationInputFields(actionId),
                        precondition: registrationPrecondition(
                            actionId,
                            registration,
                            requirements,
                            kind,
                        ),
                    };
                };
                const canUpdate = permissions.includes('registrations.update');
                const allEvidence = await manager.find(
                    RegistrationEvidenceEntity,
                    { where: { registrationId: id }, select: { id: true } },
                );
                const targets = [
                    {
                        targetType: 'registration',
                        targetId: String(id),
                        action: In(Object.keys(historyLabels)),
                    },
                ];
                const related = [
                    ['registration_requirement', requirements],
                    ['registration_evidence', allEvidence],
                    ['registration_data_request', requests],
                ] as const;
                const history = await manager.find(AuditEventEntity, {
                    where: [
                        ...targets,
                        ...related
                            .filter(([, rows]) => rows.length)
                            .map(([targetType, rows]) => ({
                                targetType,
                                targetId: In(
                                    rows.map((row: { id: number }) =>
                                        String(row.id),
                                    ),
                                ),
                                action: In(Object.keys(historyLabels)),
                            })),
                    ],
                    order: { createdAt: 'DESC', id: 'DESC' },
                    take: 100,
                    select: {
                        id: true,
                        action: true,
                        createdAt: true,
                        actorType: true,
                        result: true,
                    },
                });
                return {
                    registration: {
                        id,
                        platform: registration.platform,
                        status: registration.status,
                        readiness: computeRegistrationReadiness(
                            registration.ofdProvisionMode,
                            requirements.map((row) => row.status),
                        ),
                        ofdProvisionMode: registration.ofdProvisionMode,
                        priority: registration.priority,
                        equipmentKitId: registration.equipmentKitId,
                        assignedEngineer:
                            staff.get(registration.assignedEngineerId) ?? null,
                        handedOffAt: registration.handedOffAt,
                        createdAt: registration.createdAt,
                        updatedAt: registration.updatedAt,
                        application: Object.fromEntries(
                            applicationFields.map((key) => [
                                key,
                                registration[key] ?? null,
                            ]),
                        ),
                    },
                    checklistAvailable: requirements.length === 3,
                    requirements: requirements.map((item) => ({
                        id: item.id,
                        kind: item.kind,
                        status: item.status,
                        value:
                            item.kind === 'ofd_code'
                                ? item.value
                                    ? '••••••••'
                                    : null
                                : item.value,
                        hasValue: Boolean(item.value),
                        source: item.source,
                        version: item.version,
                        requestedAt: item.requestedAt,
                        providedAt: item.providedAt,
                        verifiedAt: item.verifiedAt,
                        verifiedBy: staff.get(item.verifiedByStaffId) ?? null,
                        notRequiredReason: item.notRequiredReason,
                        operatorComment: item.operatorComment,
                        actions: canUpdate
                            ? registrationRequirementActions.map((name) =>
                                  action(name, item.kind),
                              )
                            : [],
                    })),
                    evidence: evidence.map((item) => ({
                        id: item.id,
                        requirementId: item.requirementId,
                        kind: item.kind,
                        createdAt: item.createdAt,
                        ...this.document(
                            item.storedFile,
                            `/admin/api/registration-evidence/${item.id}/file`,
                        ),
                    })),
                    dataRequests: requests.map((item) => ({
                        id: item.id,
                        requirementId: item.requirementId,
                        requestText: item.requestText,
                        status: item.status,
                        targetChannel: item.targetChannel,
                        createdAt: item.createdAt,
                        deliveredAt: item.deliveredAt,
                        answeredAt: item.answeredAt,
                        closedAt: item.closedAt,
                        deliveryError:
                            item.status === 'delivery_failed'
                                ? 'Не удалось доставить запрос в мессенджер.'
                                : null,
                    })),
                    pdf: pdf
                        ? {
                              ...this.document(
                                  pdf,
                                  `/admin/api/registrations/${id}/pdf`,
                              ),
                              classification:
                                  pdf.metadata?.final === true
                                      ? 'final'
                                      : pdf.metadata?.draft === true
                                        ? 'draft'
                                        : 'unknown',
                          }
                        : null,
                    workflow: {
                        primaryActionId: null,
                        actions: canUpdate
                            ? registrationRootActions.map((name) =>
                                  action(name),
                              )
                            : [],
                    },
                    history: history.map((item) => ({
                        id: item.id,
                        label: historyLabels[item.action],
                        createdAt: item.createdAt,
                        actorType: item.actorType,
                        result: item.result,
                    })),
                    historyLimit: 100,
                };
            },
        );
    }

    revealOfd(admin: AdminPrincipal, id: number) {
        return this.dataSource.transaction(
            'REPEATABLE READ',
            async (manager) => {
                await this.authorize(manager, admin, id);
                const requirement = await manager.findOneBy(
                    RegistrationRequirementEntity,
                    { registrationId: id, kind: 'ofd_code' },
                );
                return { value: requirement?.value ?? null };
            },
        );
    }

    options(admin: AdminPrincipal, id: number) {
        return this.dataSource.transaction(
            'REPEATABLE READ',
            async (manager) => {
                await this.authorize(manager, admin, id, true);
                const kits = await manager.find(EquipmentKitEntity, {
                    where: {
                        registrationRequestId: IsNull(),
                        status: In(['stock', 'sent']),
                    },
                    select: {
                        id: true,
                        cashRegisterModel: true,
                        cashRegisterSerial: true,
                        fiscalDriveSerial: true,
                    },
                    order: { id: 'DESC' },
                    take: 100,
                });
                const engineers = await manager
                    .getRepository(AdminUserEntity)
                    .createQueryBuilder('staff')
                    .innerJoin(
                        'staff.roleAssignments',
                        'assignment',
                        'assignment.role = :role',
                        { role: 'engineer' },
                    )
                    .select(['staff.id', 'staff.displayName'])
                    .where('staff.isActive = true')
                    .orderBy('staff.displayName', 'ASC')
                    .addOrderBy('staff.id', 'ASC')
                    .take(100)
                    .getMany();
                return {
                    kits: kits.map((kit) => ({
                        id: kit.id,
                        cashRegisterModel: kit.cashRegisterModel,
                        cashRegisterSerial: kit.cashRegisterSerial,
                        fiscalDriveSerial: kit.fiscalDriveSerial,
                    })),
                    engineers: engineers.map((staff) => ({
                        id: staff.id,
                        displayName: staff.displayName,
                    })),
                    limit: 100,
                };
            },
        );
    }

    private async identities(
        manager: EntityManager,
        ids: Array<number | null>,
    ) {
        const unique = [
            ...new Set(ids.filter((id): id is number => Boolean(id))),
        ];
        const staff = unique.length
            ? await manager.find(AdminUserEntity, {
                  where: { id: In(unique) },
                  select: { id: true, displayName: true },
              })
            : [];
        return new Map<number | null, { id: number; displayName: string }>(
            staff.map((item) => [
                item.id,
                { id: item.id, displayName: item.displayName },
            ]),
        );
    }

    private document(file: StoredFileEntity | null, url: string) {
        const downloadable = file?.status === 'active';
        return {
            originalName: file?.originalName ?? 'Документ',
            mimeType: file?.mimeType ?? null,
            sizeBytes: file ? Number(file.sizeBytes) : null,
            downloadable,
            downloadUrl: downloadable ? url : null,
            unavailableReason: downloadable ? null : 'Файл недоступен',
        };
    }
}
