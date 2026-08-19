import { computeRegistrationReadiness } from './registration-readiness.service';

describe('registration readiness', () => {
    it.each([
        ['customer_has_code', ['missing', 'missing', 'missing'], 'incomplete'],
        [
            'customer_has_code',
            ['requested', 'verified', 'verified'],
            'awaiting_customer',
        ],
        [
            'customer_has_code',
            ['provided', 'verified', 'verified'],
            'awaiting_verification',
        ],
        ['customer_has_code', ['verified', 'verified', 'verified'], 'ready'],
        ['not_applicable', ['verified', 'verified', 'not_required'], 'ready'],
        [
            'clarification_required',
            ['verified', 'verified', 'verified'],
            'incomplete',
        ],
        [
            'purchase_from_vitma',
            ['verified', 'verified', 'missing'],
            'incomplete',
        ],
        [
            'purchase_from_vitma',
            ['verified', 'verified', 'provided'],
            'awaiting_verification',
        ],
        ['purchase_from_vitma', ['verified', 'verified', 'verified'], 'ready'],
    ] as const)('%s with %j becomes %s', (mode, statuses, expected) => {
        expect(computeRegistrationReadiness(mode, [...statuses])).toBe(
            expected,
        );
    });
});
