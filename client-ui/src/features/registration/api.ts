import {
    checkSession,
    ClientApiError,
    failed,
    json,
    send,
} from '../../api/client-session';
import type {
    RegistrationDetail,
    RegistrationList,
    RequirementKind,
} from './types';
const root = '/api/client/registrations';
export function registrationId(value: string | undefined) {
    if (
        !value ||
        !/^[1-9][0-9]{0,9}$/.test(value) ||
        (value.length === 10 && value > '2147483647')
    )
        throw new ClientApiError(400, 'VALIDATION_ERROR');
    return Number(value);
}
async function read<T>(path: string, signal?: AbortSignal, notify = true) {
    await checkSession(signal, notify);
    return send<T>(`${root}${path}`, { signal }, true, notify);
}
export const registrationApi = {
    list: (signal?: AbortSignal, notify = true) =>
        read<RegistrationList>('', signal, notify),
    detail: (id: number, signal?: AbortSignal) =>
        read<RegistrationDetail>(`/${id}`, signal),
    create: () => json<RegistrationDetail>(`${root}/drafts`, 'POST', {}),
    save: (
        id: number,
        expectedUpdatedAt: string,
        values: Record<string, string>,
    ) =>
        json<RegistrationDetail>(`${root}/${id}/draft`, 'PATCH', {
            expectedUpdatedAt,
            values,
        }),
    submit: (id: number, expectedUpdatedAt: string) =>
        json<RegistrationDetail>(`${root}/${id}/submit`, 'POST', {
            expectedUpdatedAt,
        }),
    value: (
        id: number,
        kind: RequirementKind,
        value: string,
        expectedRequirementVersion: number,
    ) =>
        json<RegistrationDetail>(
            `${root}/${id}/requirements/${kind}/value`,
            'POST',
            { value, expectedRequirementVersion },
        ),
    evidence: (
        id: number,
        kind: RequirementKind,
        file: File,
        expectedRequirementVersion: number,
    ) => {
        const body = new FormData();
        body.append('file', file);
        body.append(
            'expectedRequirementVersion',
            String(expectedRequirementVersion),
        );
        return send<RegistrationDetail>(
            `${root}/${id}/requirements/${kind}/evidence`,
            { method: 'POST', body },
        );
    },
};
export async function downloadRegistrationEvidence(url: string, name: string) {
    const target = new URL(url, window.location.origin);
    const match =
        /^\/api\/client\/registrations\/([1-9]\d*)\/evidence\/([1-9]\d*)$/.exec(
            target.pathname,
        );
    if (
        target.origin !== window.location.origin ||
        target.search ||
        target.hash ||
        !match
    )
        throw new ClientApiError(400, 'INVALID_DOWNLOAD');
    registrationId(match[1]);
    registrationId(match[2]);
    let response: Response;
    try {
        response = await fetch(target, {
            credentials: 'include',
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        throw new ClientApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) return failed(response, true, true);
    if (
        !(response.headers.get('content-disposition') ?? '').startsWith(
            'attachment',
        ) ||
        !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
            (response.headers.get('content-type') ?? '').split(';')[0],
        )
    )
        throw new ClientApiError(0, 'INVALID_DOCUMENT');
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download =
        Array.from(name)
            .map((c) => (c.charCodeAt(0) < 32 || '/\\'.includes(c) ? '_' : c))
            .join('')
            .slice(0, 180) || 'evidence';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}
