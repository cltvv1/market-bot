import {
    createServiceRequestAnswerCallback,
    createServiceRequestConfirmCallback,
    parseServiceRequestAnswerCallback,
    parseServiceRequestConfirmCallback,
} from './service-request-callback';

describe('service request callback protocol', () => {
    it('round-trips a version-bound answer callback', () => {
        const callback = createServiceRequestAnswerCallback({
            requestId: 42,
            expectedStep: 2,
            expectedVersion: 7,
            value: '36',
        });

        expect(callback).toBe('sra2:42:2:7:36');
        expect(parseServiceRequestAnswerCallback(callback)).toEqual({
            requestId: 42,
            expectedStep: 2,
            expectedVersion: 7,
            value: '36',
        });
    });

    it('rejects malformed callbacks instead of using partial data', () => {
        expect(parseServiceRequestAnswerCallback('sra2:42:2:7')).toBeNull();
        expect(
            parseServiceRequestAnswerCallback('sra2:42:two:7:36'),
        ).toBeNull();
        expect(
            parseServiceRequestAnswerCallback('sra2:42:2:7:36:unexpected'),
        ).toBeNull();
        expect(parseServiceRequestConfirmCallback('src2:42:2')).toBeNull();
    });

    it('round-trips a version-bound confirmation callback', () => {
        const callback = createServiceRequestConfirmCallback({
            requestId: 42,
            expectedStep: 4,
            expectedVersion: 9,
        });

        expect(callback).toBe('src2:42:4:9');
        expect(parseServiceRequestConfirmCallback(callback)).toEqual({
            requestId: 42,
            expectedStep: 4,
            expectedVersion: 9,
        });
    });
});
