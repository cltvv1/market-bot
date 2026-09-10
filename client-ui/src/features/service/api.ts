import type {
    Answers,
    DraftResult,
    OwnerDetail,
    PublicDetail,
    RequestSummary,
    ServiceType,
} from './types';

const root = '/api/client/service-requests';
export const SESSION_LOST = 'vitma-service-session-lost';
const errorMessages: Record<number, string> = {
    400: 'Проверьте заполнение полей и формат файла.',
    401: 'Сессия браузера недоступна. Откройте заявку в браузере, где она была создана. Новое обращение не восстановит прежний доступ.',
    403: 'Действие недоступно. Проверьте адрес сайта или обратитесь к сотруднику.',
    404: 'Заявка или документ недоступны в этой сессии.',
    409: 'Заявка изменилась. Проверьте актуальные данные перед повторной отправкой.',
    413: 'Файл превышает допустимый размер.',
    429: 'Слишком много запросов. Подождите перед повторной попыткой.',
};
export class ServiceApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        public fields: string[] = [],
    ) {
        super(
            errorMessages[status] ??
                'Не удалось получить подтверждение от сервера. Проверьте состояние заявки перед повторным действием.',
        );
    }
    get uncertain() {
        return this.status === 0 || this.status >= 500;
    }
}
let bootstrap: Promise<void> | null = null;
export function isSessionError(error: unknown) {
    return error instanceof ServiceApiError && error.status === 401;
}
export function errorText(error: unknown) {
    return error instanceof ServiceApiError
        ? error.message
        : 'Не удалось выполнить действие. Повторите проверку состояния заявки.';
}
async function failed(
    response: Response,
    owner: boolean,
    notify: boolean,
): Promise<never> {
    if (response.status === 401 && owner && notify) {
        bootstrap = null;
        if (notify && typeof window !== 'undefined')
            window.dispatchEvent(new Event(SESSION_LOST));
    }
    let code = 'REQUEST_FAILED';
    let fields: string[] = [];
    try {
        const data = (await response.json()) as {
            code?: unknown;
            errors?: { field?: unknown }[];
        };
        if (typeof data.code === 'string' && /^[A-Z_]{1,64}$/.test(data.code))
            code = data.code;
        if (Array.isArray(data.errors))
            fields = data.errors.flatMap((item) =>
                typeof item.field === 'string' &&
                /^[a-zA-Z0-9_.]{1,80}$/.test(item.field)
                    ? [item.field]
                    : [],
            );
    } catch {
        /* Never display an upstream HTML error page. */
    }
    throw new ServiceApiError(response.status, code, fields);
}
async function send<T>(
    url: string,
    init: RequestInit = {},
    owner = true,
    notify = true,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            credentials: owner ? 'include' : 'omit',
            cache: 'no-store',
            signal: init.signal ?? AbortSignal.timeout(30_000),
        });
    } catch (error) {
        if (init.signal?.aborted) throw error;
        throw new ServiceApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) return failed(response, owner, notify);
    try {
        return (await response.json()) as T;
    } catch {
        throw new ServiceApiError(0, 'INVALID_RESPONSE');
    }
}
function json<T>(url: string, method: string, body: unknown) {
    return send<T>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
export async function checkSession(signal?: AbortSignal, notify = true) {
    await send('/api/client/session', { signal }, true, notify);
}
// Only an explicit new-request action may create a new browser identity.
export function beginNewSession() {
    if (!bootstrap)
        bootstrap = (async () => {
            try {
                await checkSession(undefined, false);
            } catch (error) {
                if (!isSessionError(error)) throw error;
                await send(
                    '/api/client/session',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}',
                    },
                    true,
                    false,
                );
            }
        })().finally(() => {
            bootstrap = null;
        });
    return bootstrap;
}
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
