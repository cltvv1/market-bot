import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import type { RegistrationRequestEntity } from './entities/registration.entity';
import type { RegistrationFieldEntity } from './entities/registration-field.entity';
import type { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { REGISTRATION_REQUIREMENT_KINDS } from './registration.types';

export const CLIENT_REGISTRATION_FIELDS = [
    'orgName',
    'ogrn',
    'innKpp',
    'urAdress',
    'kktAdress',
    'kktName',
    'phone',
    'phoneToCall',
    'email',
    'taxSystem',
    'nds',
    'excise',
    'markirovka',
    'services',
    'strictReporting',
    'kktModel',
    'ofd',
    'bankReqs',
] as const;
export type ClientRegistrationField =
    (typeof CLIENT_REGISTRATION_FIELDS)[number];
export type ClientRegistrationValues = Partial<
    Record<ClientRegistrationField, string | null>
>;
const required = new Set<string>(['orgName', 'innKpp', 'phoneToCall']);

export function clientRegistrationForm(fields: RegistrationFieldEntity[]) {
    return {
        available: [...required].every(
            (name) =>
                fields.filter((field) => field.name === name).length === 1,
        ),
        fields: [...fields]
            .sort((a, b) => a.step - b.step || a.id - b.id)
            .filter((field) =>
                CLIENT_REGISTRATION_FIELDS.some((name) => name === field.name),
            )
            .map((field) => ({
                name: field.name as ClientRegistrationField,
                label: field.label,
                step: field.step,
                required: required.has(field.name),
                inputKind: ['urAdress', 'kktAdress', 'bankReqs'].includes(
                    field.name,
                )
                    ? ('textarea' as const)
                    : field.name === 'email'
                      ? ('email' as const)
                      : ['phone', 'phoneToCall'].includes(field.name)
                        ? ('tel' as const)
                        : ('text' as const),
                maxLength: field.name === 'bankReqs' ? 10000 : 1000,
            })),
    };
}
export function normalizeRegistrationValues(
    values: unknown,
): ClientRegistrationValues {
    if (!values || typeof values !== 'object' || Array.isArray(values))
        throw new BadRequestException('Registration values must be an object');
    const result: ClientRegistrationValues = {};
    for (const [key, value] of Object.entries(values)) {
        if (
            !CLIENT_REGISTRATION_FIELDS.some((name) => name === key) ||
            typeof value !== 'string'
        )
            throw new BadRequestException('Unsupported registration field');
        const maximum = key === 'bankReqs' ? 10000 : 1000;
        if (value.length > maximum)
            throw new BadRequestException(
                `Registration field ${key} is too long`,
            );
        result[key as ClientRegistrationField] = value.trim() || null;
    }
    return result;
}
export function assertRequiredRegistrationValues(
    values: ClientRegistrationValues,
) {
    const missing = [...required].filter(
        (key) => !values[key as ClientRegistrationField]?.trim(),
    );
    if (missing.length)
        throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Required registration fields are missing',
            errors: missing.map((field) => ({
                field: `values.${field}`,
                message: 'This field is required',
            })),
        });
}
export function assertRegistrationOwner(
    registration: RegistrationRequestEntity | null,
    session: Pick<WebSessionPrincipal, 'userId' | 'chatId'>,
): asserts registration is RegistrationRequestEntity {
    if (
        !registration ||
        registration.platform !== 'web' ||
        (registration.userId !== null
            ? registration.userId !== session.userId
            : registration.chatId !== session.chatId)
    )
        throw new NotFoundException('Registration was not found');
}
export function registrationChecklistAvailable(
    requirements: RegistrationRequirementEntity[],
) {
    return (
        requirements.length === 3 &&
        REGISTRATION_REQUIREMENT_KINDS.every(
            (kind) =>
                requirements.filter(
                    (item) =>
                        item.kind === kind &&
                        Number.isInteger(item.version) &&
                        item.version > 0 &&
                        [
                            'missing',
                            'requested',
                            'provided',
                            'verified',
                            'not_required',
                        ].includes(item.status),
                ).length === 1,
        )
    );
}
export function assertRegistrationDraft(
    registration: RegistrationRequestEntity,
    expectedUpdatedAt: string,
) {
    if (
        registration.status !== 'draft' ||
        registration.handedOffAt ||
        registration.updatedAt.toISOString() !== expectedUpdatedAt
    )
        throw new ConflictException(
            'Registration changed; reload before continuing',
        );
}
export function assertWebRegistrationMutable(
    registration: RegistrationRequestEntity,
) {
    if (
        !['new', 'in_work'].includes(registration.status) ||
        registration.handedOffAt
    )
        throw new ConflictException(
            'Registration does not accept customer responses',
        );
}
