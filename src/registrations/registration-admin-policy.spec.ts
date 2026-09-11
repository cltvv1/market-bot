import {
    assertRegistrationPrecondition,
    registrationActionReason,
    registrationPrecondition,
} from './registration-admin-policy';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { REGISTRATION_REQUIREMENT_KINDS } from './registration.types';

describe('registration admin policy', () => {
    const registration = Object.assign(new RegistrationRequestEntity(), {
        id: 1,
        status: 'new',
        priority: 'normal',
        ofdProvisionMode: 'customer_has_code',
        handedOffAt: null,
        assignedEngineerId: null,
        equipmentKitId: null,
        pdfFileId: null,
    });
    const requirements = REGISTRATION_REQUIREMENT_KINDS.map((kind, index) =>
        Object.assign(new RegistrationRequirementEntity(), {
            id: index + 1,
            kind,
            version: 2,
            status: 'provided',
            value: 'synthetic-value',
            source: 'operator_input',
        }),
    );
    it('projects a real requirement version without value or aggregate version', () => {
        const result = registrationPrecondition(
            'verify',
            registration,
            requirements,
            'ofd_code',
        );
        expect(result).toEqual({
            expectedStatus: 'new',
            expectedHandedOffAt: null,
            expectedRequirementVersion: 2,
        });
        expect(JSON.stringify(result).includes('synthetic-value')).toBe(false);
    });
    it('rejects missing preconditions instead of accepting an unguarded command', () => {
        expect(() =>
            assertRegistrationPrecondition(
                {} as never,
                registrationPrecondition(
                    'verify',
                    registration,
                    requirements,
                    'kkt_serial',
                ),
            ),
        ).toThrow('incomplete');
    });
    it('rejects a stale requirement', () => {
        const current = registrationPrecondition(
            'verify',
            registration,
            requirements,
            'kkt_serial',
        );
        expect(() =>
            assertRegistrationPrecondition(
                { ...current, expectedRequirementVersion: 1 },
                current,
            ),
        ).toThrow('changed');
    });
    it.each([
        'operator-state',
        'ofd-mode',
        'equipment-kit',
        'handoff',
        'final-pdf',
    ] as const)('%s includes and checks relevant root fields', (action) => {
        const condition = registrationPrecondition(
            action,
            registration,
            requirements,
        );
        expect(() =>
            assertRegistrationPrecondition(condition, condition),
        ).not.toThrow();
        expect(() =>
            assertRegistrationPrecondition(
                { ...condition, expectedStatus: 'processed' },
                condition,
            ),
        ).toThrow('changed');
    });
    it('checks every required version in multi-requirement commands', () => {
        const current = registrationPrecondition(
            'handoff',
            registration,
            requirements,
        );
        expect(() =>
            assertRegistrationPrecondition(
                {
                    ...current,
                    expectedRequirementVersions: {
                        ...current.expectedRequirementVersions,
                        ofd_code: 1,
                    },
                },
                current,
            ),
        ).toThrow('changed');
    });
    it.each(['final-pdf', 'handoff'] as const)(
        '%s is blocked without a complete checklist',
        (action) => {
            expect(
                registrationActionReason(action, registration, [])?.reasonCode,
            ).toBe('CHECKLIST_MISSING');
            expect(
                registrationActionReason(action, registration, requirements)
                    ?.reasonCode,
            ).toBe('NOT_READY');
        },
    );
    it('verification requires both canonical value and source', () => {
        for (const patch of [{ value: null }, { source: null }]) {
            expect(
                registrationActionReason(
                    'verify',
                    registration,
                    requirements.map((item) =>
                        item.kind === 'kkt_serial'
                            ? { ...item, ...patch }
                            : item,
                    ),
                    'kkt_serial',
                )?.reasonCode,
            ).toBe('VALUE_SOURCE_REQUIRED');
        }
    });
    it('ready is not processed or FNS completion and does not require a PDF', () => {
        const checked = requirements.map((item) => ({
            ...item,
            status: 'verified' as const,
        }));
        expect(
            registrationActionReason('handoff', registration, checked),
        ).toBeNull();
        expect(registration.status).toBe('new');
        expect(registration.pdfFileId).toBeNull();
    });
    it('does not ask a customer for a code promised by VITMA', () => {
        expect(
            registrationActionReason(
                'request-data',
                { ...registration, ofdProvisionMode: 'purchase_from_vitma' },
                requirements,
                'ofd_code',
            )?.reasonCode,
        ).toBe('VITMA_PROVIDES_CODE');
    });
});
