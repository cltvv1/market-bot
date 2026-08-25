export const STALE_SERVICE_REQUEST_CALLBACK_MESSAGE =
    'Эта кнопка больше не актуальна, выберите актуальный вариант.';

const ANSWER_PREFIX = 'sra2';
const CONFIRM_PREFIX = 'src2';

export interface ServiceRequestAnswerCallback {
    requestId: number;
    expectedStep: number;
    expectedVersion: number;
    value: string;
}

export interface ServiceRequestConfirmCallback {
    requestId: number;
    expectedStep: number;
    expectedVersion: number;
}

export function createServiceRequestAnswerCallback(
    input: ServiceRequestAnswerCallback,
) {
    const callback = `${ANSWER_PREFIX}:${input.requestId}:${input.expectedStep}:${input.expectedVersion}:${encodeURIComponent(input.value)}`;
    assertCallbackLength(callback);
    return callback;
}

export function createServiceRequestConfirmCallback(
    input: ServiceRequestConfirmCallback,
) {
    const callback = `${CONFIRM_PREFIX}:${input.requestId}:${input.expectedStep}:${input.expectedVersion}`;
    assertCallbackLength(callback);
    return callback;
}

export function parseServiceRequestAnswerCallback(
    callback: string,
): ServiceRequestAnswerCallback | null {
    const parts = callback.split(':');
    if (parts.length !== 5) return null;
    const [prefix, requestId, expectedStep, expectedVersion, encodedValue] =
        parts;
    if (
        prefix !== ANSWER_PREFIX ||
        !requestId ||
        !expectedStep ||
        !expectedVersion ||
        !encodedValue ||
        !isPositiveInteger(requestId) ||
        !isNonNegativeInteger(expectedStep) ||
        !isPositiveInteger(expectedVersion)
    ) {
        return null;
    }

    try {
        const value = decodeURIComponent(encodedValue);
        if (!value) return null;
        return {
            requestId: Number(requestId),
            expectedStep: Number(expectedStep),
            expectedVersion: Number(expectedVersion),
            value,
        };
    } catch {
        return null;
    }
}

export function parseServiceRequestConfirmCallback(
    callback: string,
): ServiceRequestConfirmCallback | null {
    const [prefix, requestId, expectedStep, expectedVersion, extra] =
        callback.split(':');
    if (
        prefix !== CONFIRM_PREFIX ||
        !requestId ||
        !expectedStep ||
        !expectedVersion ||
        extra !== undefined ||
        !isPositiveInteger(requestId) ||
        !isNonNegativeInteger(expectedStep) ||
        !isPositiveInteger(expectedVersion)
    ) {
        return null;
    }

    return {
        requestId: Number(requestId),
        expectedStep: Number(expectedStep),
        expectedVersion: Number(expectedVersion),
    };
}

export function isServiceRequestAnswerCallback(callback: string) {
    return parseServiceRequestAnswerCallback(callback) !== null;
}

export function isServiceRequestConfirmCallback(callback: string) {
    return parseServiceRequestConfirmCallback(callback) !== null;
}

function isPositiveInteger(value: string) {
    const parsed = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0;
}

function isNonNegativeInteger(value: string) {
    const parsed = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed >= 0;
}

function assertCallbackLength(callback: string) {
    if (Buffer.byteLength(callback, 'utf8') > 64) {
        throw new Error(
            'Service request callback exceeds Telegram length limit',
        );
    }
}
