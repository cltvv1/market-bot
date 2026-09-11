import type { ArgumentMetadata, Type } from '@nestjs/common';
import { createValidationPipe } from '../common/http/validation';
import {
    RegistrationEvidenceLinkDto,
    RegistrationEvidenceParamsDto,
    RegistrationHandoffDto,
} from '../admin/dto/admin-api.dto';
import {
    RegistrationAdminCommandDto,
    RegistrationEquipmentKitDto,
    RegistrationIdParamDto,
    REGISTRATION_ID_MAX,
} from './registration-admin.dto';

const pipe = createValidationPipe();
const precondition = { expectedStatus: 'new', expectedHandedOffAt: null };
const malformedPaths = [
    '0',
    '-1',
    '1.5',
    '+1',
    '1e3',
    '1abc',
    'Infinity',
    'NaN',
    '2147483648',
    '9007199254740992',
    '9'.repeat(400),
    '01',
    ' 1',
    '1 ',
    '1\n',
    '1\r\n',
];
const invalidNumbers = [
    0,
    -1,
    1.5,
    2147483648,
    9007199254740992,
    Infinity,
    NaN,
    '2147483648',
    '9007199254740992',
    '9'.repeat(400),
    '1abc',
];

function validate(
    metatype: Type<unknown>,
    value: unknown,
    type: ArgumentMetadata['type'] = 'body',
): Promise<unknown> {
    return pipe.transform(value, { type, metatype });
}

function invalidField(field: string): unknown {
    const fieldMatcher: unknown = expect.objectContaining({ field });
    const errors: unknown = expect.arrayContaining([fieldMatcher]);
    const response: unknown = expect.objectContaining({
        code: 'VALIDATION_ERROR',
        errors,
    });
    return expect.objectContaining({ response }) as unknown;
}

describe('Registration bounded identifiers through the HTTP ValidationPipe', () => {
    describe.each([
        ['registration ID', RegistrationIdParamDto, 'id', {}],
        [
            'remove registration ID',
            RegistrationEvidenceParamsDto,
            'id',
            { evidenceId: '1' },
        ],
        [
            'remove evidence ID',
            RegistrationEvidenceParamsDto,
            'evidenceId',
            { id: '1' },
        ],
    ] as const)('%s', (_name, dto, field, other) => {
        it.each(['1', String(REGISTRATION_ID_MAX)])(
            'accepts %s without numeric conversion',
            async (value) => {
                await expect(
                    validate(dto, { ...other, [field]: value }, 'param'),
                ).resolves.toMatchObject({ [field]: value });
            },
        );
        it('rejects malformed, unsafe and out-of-range paths', async () => {
            for (const value of [...malformedPaths, 1, null, undefined]) {
                await expect(
                    validate(dto, { ...other, [field]: value }, 'param'),
                ).rejects.toEqual(invalidField(field));
            }
        });
    });

    describe.each([
        ['kitId', RegistrationEquipmentKitDto, {}],
        ['evidenceId', RegistrationEvidenceLinkDto, { kind: 'kkt_serial' }],
        ['engineerId', RegistrationHandoffDto, {}],
    ] as const)('body %s', (field, dto, other) => {
        it.each([1, REGISTRATION_ID_MAX])(
            'accepts the boundary %s and existing numeric-string coercion',
            async (value) => {
                for (const input of [value, String(value)]) {
                    await expect(
                        validate(dto, {
                            precondition,
                            ...other,
                            [field]: input,
                        }),
                    ).resolves.toMatchObject({ [field]: value });
                }
            },
        );
        it('rejects provided IDs outside the integer range', async () => {
            for (const value of invalidNumbers) {
                await expect(
                    validate(dto, { precondition, ...other, [field]: value }),
                ).rejects.toEqual(invalidField(field));
            }
        });
        it('preserves required or optional/null semantics', async () => {
            for (const value of [null, undefined]) {
                const pending = validate(dto, {
                    precondition,
                    ...other,
                    [field]: value,
                });
                if (field === 'engineerId') {
                    await expect(pending).resolves.toMatchObject({
                        [field]: value,
                    });
                } else {
                    await expect(pending).rejects.toEqual(invalidField(field));
                }
            }
        });
    });

    describe.each([
        'expectedKitId',
        'expectedEngineerId',
        'expectedPdfFileId',
    ] as const)('%s', (field) => {
        it.each([1, REGISTRATION_ID_MAX, null, undefined])(
            'preserves valid/nullable/optional value %s',
            async (value) => {
                await expect(
                    validate(RegistrationAdminCommandDto, {
                        precondition: { ...precondition, [field]: value },
                    }),
                ).resolves.toMatchObject({ precondition: { [field]: value } });
            },
        );
        it('rejects malformed values without coercing the snapshot', async () => {
            for (const value of [...invalidNumbers, '1', ...malformedPaths]) {
                await expect(
                    validate(RegistrationAdminCommandDto, {
                        precondition: { ...precondition, [field]: value },
                    }),
                ).rejects.toEqual(invalidField(`precondition.${field}`));
            }
        });
    });

    it('keeps requirement version lower/upper bounds, including all nested versions', async () => {
        for (const version of [1, REGISTRATION_ID_MAX]) {
            await expect(
                validate(RegistrationAdminCommandDto, {
                    precondition: {
                        ...precondition,
                        expectedRequirementVersion: version,
                        expectedRequirementVersions: {
                            kkt_serial: version,
                            fiscal_drive_serial: version,
                            ofd_code: version,
                        },
                    },
                }),
            ).resolves.toBeInstanceOf(RegistrationAdminCommandDto);
        }
        for (const version of [0, REGISTRATION_ID_MAX + 1]) {
            await expect(
                validate(RegistrationAdminCommandDto, {
                    precondition: {
                        ...precondition,
                        expectedRequirementVersion: version,
                    },
                }),
            ).rejects.toEqual(
                invalidField('precondition.expectedRequirementVersion'),
            );
            for (const kind of [
                'kkt_serial',
                'fiscal_drive_serial',
                'ofd_code',
            ]) {
                await expect(
                    validate(RegistrationAdminCommandDto, {
                        precondition: {
                            ...precondition,
                            expectedRequirementVersions: {
                                kkt_serial: 1,
                                fiscal_drive_serial: 1,
                                ofd_code: 1,
                                [kind]: version,
                            },
                        },
                    }),
                ).rejects.toEqual(
                    invalidField(
                        `precondition.expectedRequirementVersions.${kind}`,
                    ),
                );
            }
        }
    });
});
