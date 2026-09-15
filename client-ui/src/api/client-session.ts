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
export class ClientApiError extends Error {
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
    return error instanceof ClientApiError && error.status === 401;
}
export function errorText(error: unknown) {
    return error instanceof ClientApiError
        ? error.message
        : 'Не удалось выполнить действие. Повторите проверку состояния заявки.';
}
export async function failed(
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
    throw new ClientApiError(response.status, code, fields);
}
export async function send<T>(
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
        throw new ClientApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) return failed(response, owner, notify);
    try {
        return (await response.json()) as T;
    } catch {
        throw new ClientApiError(0, 'INVALID_RESPONSE');
    }
}
export function json<T>(url: string, method: string, body: unknown) {
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
