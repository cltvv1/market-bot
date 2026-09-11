import {
    send,
    json,
    failed,
    checkSession,
    ClientApiError as ServiceApiError,
} from '../../api/client-session';
export {
    SESSION_LOST,
    checkSession,
    beginNewSession,
    isSessionError,
    errorText,
    ClientApiError as ServiceApiError,
} from '../../api/client-session';
import type {
    Answers,
    DraftResult,
    OwnerDetail,
    PublicDetail,
    RequestSummary,
    ServiceType,
} from './types';

const root = '/api/client/service-requests';
export async function ownedRead<T>(path: string, signal?: AbortSignal) {
    await checkSession(signal);
    return send<T>(`${root}${path}`, { signal });
}
export const serviceApi = {
    types: (signal?: AbortSignal) =>
        send<ServiceType[]>(`${root}/types`, { signal }),
    list: (signal?: AbortSignal) =>
        ownedRead<{ request: RequestSummary }[]>('', signal),
    detail: (id: number, signal?: AbortSignal) =>
        ownedRead<OwnerDetail>(`/${id}`, signal),
    create: (
        serviceTypeCode: string,
        name: string,
        phone: string,
        answers: Answers,
    ) =>
        json<DraftResult>(`${root}/drafts`, 'POST', {
            serviceTypeCode,
            contactSnapshot: { name, phone, preferredChannel: 'phone' },
            answers,
        }),
    save: (id: number, expectedVersion: number, answers: Answers) =>
        json<DraftResult>(`${root}/drafts/${id}`, 'PATCH', {
            expectedVersion,
            answers,
        }),
    submit: (id: number, expectedVersion: number, idempotencyKey: string) =>
        json<DraftResult>(`${root}/drafts/${id}/submit`, 'POST', {
            expectedVersion,
            idempotencyKey,
        }),
    remove: (id: number, attachmentId: number) =>
        send(`${root}/drafts/${id}/attachments/${attachmentId}`, {
            method: 'DELETE',
        }),
    message: (id: number, text: string) =>
        json(`${root}/${id}/messages`, 'POST', { text }),
    upload: (
        id: number,
        kind: 'draft' | 'message' | 'proof',
        file: File,
        expectedVersion?: number,
    ) => {
        const body = new FormData();
        body.append('file', file);
        if (kind === 'proof')
            body.append('expectedVersion', String(expectedVersion));
        const path =
            kind === 'draft'
                ? `/drafts/${id}/attachments`
                : kind === 'message'
                  ? `/${id}/messages/attachments`
                  : `/${id}/payment-proof`;
        return send(`${root}${path}`, { method: 'POST', body });
    },
};
export function publicStatus(token: string, signal?: AbortSignal) {
    return send<PublicDetail>(
        `/api/public/service-requests/${encodeURIComponent(token)}`,
        { signal },
        false,
    );
}
export function publicReply(token: string, text: string) {
    return send(
        `/api/public/service-requests/${encodeURIComponent(token)}/messages`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        },
        false,
    );
}
export function publicFile(token: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return send(
        `/api/public/service-requests/${encodeURIComponent(token)}/messages/attachments`,
        { method: 'POST', body },
        false,
    );
}
export async function downloadOwned(url: string, name: string) {
    const target = new URL(url, window.location.origin);
    if (
        target.origin !== window.location.origin ||
        target.search ||
        target.hash ||
        !/^\/api\/client\/service-requests\/[1-9]\d*\/(?:payment-proof|attachments\/[1-9]\d*)$/.test(
            target.pathname,
        )
    )
        throw new ServiceApiError(400, 'INVALID_DOWNLOAD');
    let response: Response;
    try {
        response = await fetch(target, {
            credentials: 'include',
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        throw new ServiceApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) return failed(response, true, true);
    if (
        !(response.headers.get('content-disposition') ?? '').startsWith(
            'attachment',
        ) ||
        (response.headers.get('content-type') ?? '').includes(
            'application/json',
        )
    )
        throw new ServiceApiError(0, 'INVALID_DOCUMENT');
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download =
        Array.from(name)
            .map((character) =>
                character.charCodeAt(0) < 32 || '/\\'.includes(character)
                    ? '_'
                    : character,
            )
            .join('')
            .slice(0, 180) || 'document';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}
