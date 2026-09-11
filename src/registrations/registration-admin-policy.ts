import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import {
    getPermissions,
    type AdminPermission,
} from 'src/admin/admin.permissions';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import type {
    OfdProvisionMode,
    RegistrationRequirementKind,
} from './registration.types';

export type RegistrationAdminActionId =
    | 'operator-state'
    | 'provide-value'
    | 'verify'
    | 'request-data'
    | 're-request'
    | 'not-required'
    | 'ofd-mode'
    | 'equipment-kit'
    | 'link-evidence'
    | 'remove-evidence'
    | 'final-pdf'
    | 'handoff';
export interface RegistrationPrecondition {
    expectedStatus: RegistrationRequestEntity['status'];
    expectedHandedOffAt: string | null;
    expectedRequirementVersion?: number;
    expectedRequirementVersions?: Partial<
        Record<RegistrationRequirementKind, number>
    >;
    expectedPriority?: RegistrationRequestEntity['priority'];
    expectedOfdMode?: OfdProvisionMode;
    expectedKitId?: number | null;
    expectedEngineerId?: number | null;
    expectedPdfFileId?: number | null;
}
export interface RegistrationCommandContext {
    staffId: number;
    action: RegistrationAdminActionId;
    precondition: RegistrationPrecondition;
}

export const registrationRequirementActions: RegistrationAdminActionId[] = [
    'provide-value',
    'verify',
    'request-data',
    're-request',
    'not-required',
    'link-evidence',
];
export const registrationRootActions: RegistrationAdminActionId[] = [
    'operator-state',
    'ofd-mode',
    'equipment-kit',
    'final-pdf',
    'handoff',
    'remove-evidence',
];

export function registrationInputFields(action: RegistrationAdminActionId) {
    const fields: Record<
        RegistrationAdminActionId,
        Array<{
            name: string;
            required: boolean;
            requiredWhen?: { field: string; equals: string };
        }>
    > = {
        'operator-state': [
            { name: 'priority', required: false },
            { name: 'status', required: false },
        ],
        'provide-value': [
            { name: 'value', required: true },
            { name: 'source', required: false },
        ],
        verify: [{ name: 'comment', required: false }],
        'request-data': [{ name: 'text', required: false }],
        're-request': [{ name: 'text', required: true }],
        'not-required': [{ name: 'reason', required: true }],
        'ofd-mode': [
            { name: 'mode', required: true },
            {
                name: 'reason',
                required: false,
                requiredWhen: { field: 'mode', equals: 'not_applicable' },
            },
        ],
        'equipment-kit': [{ name: 'kitId', required: true }],
        'link-evidence': [{ name: 'evidenceId', required: true }],
        'remove-evidence': [],
        'final-pdf': [],
        handoff: [{ name: 'engineerId', required: false }],
    };
    return fields[action];
}

export function registrationActionReason(
    action: RegistrationAdminActionId,
    registration: RegistrationRequestEntity,
    requirements: RegistrationRequirementEntity[],
    kind?: RegistrationRequirementKind,
): { reasonCode: string; reason: string } | null {
    if (action === 'operator-state') return null;
    if (requirements.length !== 3)
        return {
            reasonCode: 'CHECKLIST_MISSING',
            reason: 'Комплектность не инициализирована. Обратитесь к администратору.',
        };
    if (action === 'handoff' || action === 'final-pdf') {
        if (
            registration.ofdProvisionMode === 'clarification_required' ||
            requirements.some(
                (item) => !['verified', 'not_required'].includes(item.status),
            )
        )
            return {
                reasonCode: 'NOT_READY',
                reason: 'Уточните способ подключения ОФД и проверьте все применимые требования.',
            };
    }
    if (action === 'verify') {
        const item = requirements.find((row) => row.kind === kind);
        if (!item?.value?.trim() || !item.source)
            return {
                reasonCode: 'VALUE_SOURCE_REQUIRED',
                reason: 'Сначала укажите значение и его источник. Фотография сама по себе не подтверждает номер.',
            };
        if (item.status === 'verified')
            return {
                reasonCode: 'ALREADY_VERIFIED',
                reason: 'Это значение уже проверено.',
            };
    }
    if (
        ['request-data', 're-request'].includes(action) &&
        kind === 'ofd_code' &&
        registration.ofdProvisionMode === 'purchase_from_vitma'
    )
        return {
            reasonCode: 'VITMA_PROVIDES_CODE',
            reason: 'Код предоставляет ВИТМА. Внесите полученный код от имени сотрудника.',
        };
    return null;
}

export function registrationPrecondition(
    action: RegistrationAdminActionId,
    registration: RegistrationRequestEntity,
    requirements: RegistrationRequirementEntity[],
    kind?: RegistrationRequirementKind,
): RegistrationPrecondition {
    const condition: RegistrationPrecondition = {
        expectedStatus: registration.status,
        expectedHandedOffAt: registration.handedOffAt?.toISOString() ?? null,
    };
    if (kind)
        condition.expectedRequirementVersion = requirements.find(
            (item) => item.kind === kind,
        )?.version;
    else if (action !== 'operator-state')
        condition.expectedRequirementVersions = Object.fromEntries(
            requirements.map((item) => [item.kind, item.version]),
        );
    if (action === 'operator-state')
        condition.expectedPriority = registration.priority;
    if (['ofd-mode', 'equipment-kit', 'handoff', 'final-pdf'].includes(action))
        condition.expectedOfdMode = registration.ofdProvisionMode;
    if (['equipment-kit', 'final-pdf'].includes(action))
        condition.expectedKitId = registration.equipmentKitId;
    if (action === 'handoff')
        condition.expectedEngineerId = registration.assignedEngineerId;
    if (action === 'final-pdf')
        condition.expectedPdfFileId = registration.pdfFileId;
    return condition;
}

export function assertRegistrationPrecondition(
    expected: RegistrationPrecondition,
    actual: RegistrationPrecondition,
) {
    if (!expected || typeof expected !== 'object')
        throw new BadRequestException('Registration precondition is required');
    for (const key of Object.keys(actual) as Array<
        keyof RegistrationPrecondition
    >) {
        if (!(key in expected))
            throw new BadRequestException(
                'Registration precondition is incomplete',
            );
        if (key === 'expectedRequirementVersions') {
            for (const [kind, version] of Object.entries(
                actual.expectedRequirementVersions ?? {},
            )) {
                if (
                    expected.expectedRequirementVersions?.[
                        kind as RegistrationRequirementKind
                    ] !== version
                )
                    throw new ConflictException(
                        'Registration data changed. Review the current data before retrying.',
                    );
            }
        } else if (expected[key] !== actual[key]) {
            throw new ConflictException(
                'Registration data changed. Review the current data before retrying.',
            );
        }
    }
}

export async function registrationPermissions(
    manager: EntityManager,
    staffId: number,
): Promise<AdminPermission[]> {
    const staff = await manager.findOne(AdminUserEntity, {
        where: { id: staffId, isActive: true },
        relations: { roleAssignments: true },
    });
    if (!staff) throw new ForbiddenException('Insufficient permissions');
    return getPermissions(
        staff.roleAssignments.map((assignment) => assignment.role),
    );
}

// All requirement/evidence writers take the registration lock first.
export async function lockRegistrationCommand(
    manager: EntityManager,
    id: number,
    context?: RegistrationCommandContext,
    kind?: RegistrationRequirementKind,
) {
    const registration = await manager.findOne(RegistrationRequestEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
    });
    if (!registration)
        throw new NotFoundException('Registration was not found');
    if (context) {
        const permissions = await registrationPermissions(
            manager,
            context.staffId,
        );
        if (!permissions.includes('registrations.update'))
            throw new ForbiddenException('Insufficient permissions');
        const requirements = await manager
            .getRepository(RegistrationRequirementEntity)
            .createQueryBuilder('requirement')
            .where('requirement.registrationId = :id', { id })
            .orderBy('requirement.id', 'ASC')
            .setLock('pessimistic_write')
            .getMany();
        assertRegistrationPrecondition(
            context.precondition,
            registrationPrecondition(
                context.action,
                registration,
                requirements,
                kind,
            ),
        );
        const reason = registrationActionReason(
            context.action,
            registration,
            requirements,
            kind,
        );
        if (reason)
            throw new ConflictException({
                message: reason.reason,
                code: reason.reasonCode,
            });
    }
    return registration;
}
