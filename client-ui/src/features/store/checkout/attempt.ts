import { send, ClientApiError } from '../../../api/client-session';
import { storeApi } from '../api';
import type { OrderSubmission } from '../types';
export interface CheckoutAttempt {
    key: string;
    payload: OrderSubmission;
    sessionExpiresAt: string;
}
export const currentCheckoutSession = () =>
    send<{ status: string; expiresAt: string }>('/api/client/session');
export function createAttempt(
    payload: OrderSubmission,
    sessionExpiresAt: string,
): CheckoutAttempt {
    return {
        key: crypto.randomUUID(),
        payload: structuredClone(payload),
        sessionExpiresAt,
    };
}
export async function submitAttempt(attempt: CheckoutAttempt) {
    const current = await currentCheckoutSession();
    // This marker prevents replay after an observed browser-session replacement.
    // Ownership and deduplication still remain enforced by the backend cookie.
    if (current.expiresAt !== attempt.sessionExpiresAt)
        throw new ClientApiError(401, 'SESSION_CHANGED');
    return storeApi.submit(attempt.payload, attempt.key);
}
