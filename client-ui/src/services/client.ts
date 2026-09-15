import type {
    OrganizationAccessFormData,
    OrganizationAccessRequest,
    OrganizationMembership,
} from '../types';

const useRealServiceApi = import.meta.env.VITE_USE_REAL_SERVICE_API !== 'false';
let sessionPromise: Promise<void> | null = null;

export const ensureWebSession = () => {
    if (!sessionPromise) {
        sessionPromise = fetch('/api/client/session', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        (await readApiMessage(response)) ||
                            'Не удалось создать защищённую сессию',
                    );
                }
            })
            .catch((error: unknown) => {
                sessionPromise = null;
                throw error;
            });
    }
    return sessionPromise;
};

const post = async <T>(url: string, body: unknown): Promise<T> => {
    await ensureWebSession();
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось выполнить запрос',
        );
    return response.json() as Promise<T>;
};

const get = async <T>(url: string): Promise<T> => {
    await ensureWebSession();
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok)
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось выполнить запрос',
        );
    return response.json() as Promise<T>;
};

const readApiMessage = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const payload = (await response.json()) as {
            message?: string;
            errors?: Array<{ message?: string }>;
        };
        return (
            payload.errors?.find((item) => item.message)?.message ||
            payload.message ||
            ''
        );
    }
    return response.text();
};

export interface CallbackRequestData {
    name: string;
    phone: string;
    topic: string;
}

export const callbackService = {
    async create(data: CallbackRequestData) {
        if (useRealServiceApi) {
            return post('/api/client/tickets/messages', {
                name: data.name,
                text: `Заявка на обратный звонок. Тема: ${data.topic}. Телефон: ${data.phone}.`,
            });
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
        const current = JSON.parse(
            localStorage.getItem('vitma_callback_requests') || '[]',
        ) as Array<CallbackRequestData & { createdAt: string }>;
        localStorage.setItem(
            'vitma_callback_requests',
            JSON.stringify([
                { ...data, createdAt: new Date().toISOString() },
                ...current,
            ]),
        );
        return { status: 'created' };
    },
};

export const organizationAccessService = {
    async listOrganizations(): Promise<OrganizationMembership[]> {
        return get<OrganizationMembership[]>('/api/client/organizations');
    },
    async listRequests(): Promise<OrganizationAccessRequest[]> {
        return get<OrganizationAccessRequest[]>(
            '/api/client/organizations/access-requests',
        );
    },
    async submit(
        data: OrganizationAccessFormData,
    ): Promise<OrganizationAccessRequest> {
        return post<OrganizationAccessRequest>(
            '/api/client/organizations/link-by-inn',
            {
                organizationName: data.organizationName.trim() || undefined,
                inn: data.inn.replace(/\D/g, ''),
                kpp: data.kpp.replace(/\D/g, '') || undefined,
                name: data.name.trim() || undefined,
                phone: data.phone.trim() || undefined,
                email: data.email.trim() || undefined,
                comment: data.comment.trim() || undefined,
            },
        );
    },
    async cancel(id: number): Promise<OrganizationAccessRequest> {
        return post<OrganizationAccessRequest>(
            `/api/client/organizations/access-requests/${id}/cancel`,
            {},
        );
    },
};
