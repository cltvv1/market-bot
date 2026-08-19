import { demoRequests } from '../data/services';
import type {
    OrderFormData,
    ServiceRequestFormData,
    ServiceRequestRecord,
    ServiceRequestStatus,
    ServiceTypeOption,
    OrganizationAccessFormData,
    OrganizationAccessRequest,
    OrganizationMembership,
} from '../types';

const REQUESTS_KEY = 'vitma_service_requests';
const useRealServiceApi = import.meta.env.VITE_USE_REAL_SERVICE_API !== 'false';
let sessionPromise: Promise<void> | null = null;

const makeNumber = (prefix: string) => {
    const date = new Date();
    const stamp = [
        String(date.getFullYear()).slice(-2),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('');
    return `${prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
};

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

const upload = async <T>(url: string, file: File): Promise<T> => {
    await ensureWebSession();
    const data = new FormData();
    data.append('file', file);
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: data,
    });
    if (!response.ok)
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось загрузить файл',
        );
    return response.json() as Promise<T>;
};

const publicGet = async <T>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
        if (response.status === 404) throw new Error('Заявка не найдена');
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось выполнить запрос',
        );
    }
    return response.json() as Promise<T>;
};

const publicPost = async <T>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось выполнить запрос',
        );
    return response.json() as Promise<T>;
};

const publicUpload = async <T>(url: string, file: File): Promise<T> => {
    const data = new FormData();
    data.append('file', file);
    const response = await fetch(url, { method: 'POST', body: data });
    if (!response.ok)
        throw new Error(
            (await readApiMessage(response)) || 'Не удалось загрузить файл',
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

export const orderService = {
    async create(data: OrderFormData) {
        await new Promise((resolve) => setTimeout(resolve, 550));
        const number = makeNumber('VM');
        localStorage.setItem(
            `vitma_order_${number}`,
            JSON.stringify({
                number,
                data,
                createdAt: new Date().toISOString(),
            }),
        );
        return { number };
    },
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

const saveRequest = (request: ServiceRequestRecord) => {
    const current = JSON.parse(
        localStorage.getItem(REQUESTS_KEY) || '[]',
    ) as ServiceRequestRecord[];
    localStorage.setItem(REQUESTS_KEY, JSON.stringify([request, ...current]));
};

export const serviceRequestService = {
    async getTypes(): Promise<ServiceTypeOption[]> {
        return get<ServiceTypeOption[]>('/api/client/service-requests/types');
    },
    async create(data: ServiceRequestFormData): Promise<ServiceRequestRecord> {
        if (useRealServiceApi) {
            const answers = {
                clientType:
                    data.clientType === 'person'
                        ? 'individual'
                        : 'organization',
                organization: data.organization,
                inn: data.inn,
                contactName: data.contactName,
                phone: data.phone,
                email: data.email,
                city: data.city,
                address: data.address,
                equipmentType: data.equipmentType,
                equipmentModel: data.equipmentModel,
                serialNumber: data.serialNumber,
                software: data.software,
                urgency: data.urgency,
                helpFormat: data.helpFormat,
                description: data.description,
                consent: data.consent,
                ...(data.problemType === 'fn_replacement'
                    ? { fiscalDriveTerm: data.fiscalDriveTerm }
                    : {}),
            };
            const draft = await post<{
                id: number;
                version: number;
                requestNumber: string;
                serviceTypeTitle: string;
                createdAt: string;
            }>('/api/client/service-requests/drafts', {
                serviceTypeCode: data.problemType,
                contactSnapshot: {
                    name: data.contactName,
                    phone: data.phone,
                    email: data.email,
                    preferredChannel: 'phone',
                },
                organizationSnapshot:
                    data.clientType === 'organization'
                        ? {
                              verified: false,
                              name: data.organization,
                              inn: data.inn,
                          }
                        : undefined,
                locationSnapshot: {
                    city: data.city,
                    address: data.address,
                },
                equipmentSnapshot: {
                    type: data.equipmentType,
                    model: data.equipmentModel,
                    serialNumber: data.serialNumber,
                    software: data.software,
                },
                answers,
            });
            for (const file of data.files) {
                await upload(
                    `/api/client/service-requests/drafts/${draft.id}/attachments`,
                    file,
                );
            }
            const submitted = await post<{
                request: {
                    requestNumber: string;
                    serviceTypeTitle: string;
                    createdAt: string;
                    customerStatus: string;
                    contactSnapshot?: { name?: string };
                };
                publicToken: string;
                messages: Array<{ text?: string; createdAt: string }>;
            }>(`/api/client/service-requests/drafts/${draft.id}/submit`, {
                expectedVersion: draft.version,
                idempotencyKey: crypto.randomUUID(),
            });
            localStorage.setItem(
                `vitma_service_token_${submitted.request.requestNumber}`,
                submitted.publicToken,
            );
            return {
                number: submitted.request.requestNumber,
                createdAt: new Date(submitted.request.createdAt).toLocaleString(
                    'ru-RU',
                ),
                status: 'accepted',
                title: submitted.request.serviceTypeTitle,
                contactName:
                    submitted.request.contactSnapshot?.name || data.contactName,
                accessToken: submitted.publicToken,
                history: submitted.messages.map((message) => ({
                    status: 'accepted' as const,
                    title: message.text || 'Заявка принята',
                    date: new Date(message.createdAt).toLocaleString('ru-RU'),
                })),
            };
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
        const request: ServiceRequestRecord = {
            number: makeNumber('SR'),
            createdAt: new Date().toLocaleString('ru-RU'),
            status: 'accepted',
            title: data.problemType,
            contactName: data.contactName,
            history: [
                {
                    status: 'accepted',
                    title: 'Заявка принята',
                    date: new Date().toLocaleString('ru-RU'),
                    note: 'Оператор проверит данные и свяжется с вами',
                },
            ],
        };
        saveRequest(request);
        return request;
    },
    async find(
        number: string,
        accessToken?: string,
    ): Promise<ServiceRequestRecord | null> {
        if (useRealServiceApi) {
            const token =
                accessToken ||
                localStorage.getItem(`vitma_service_token_${number.trim()}`) ||
                undefined;
            type CanonicalDetails = {
                request: {
                    id: number;
                    requestNumber: string;
                    serviceTypeTitle: string;
                    customerStatus: string;
                    createdAt: string;
                    contactSnapshot?: { name?: string };
                };
                messages: Array<{ text?: string; createdAt: string }>;
                attachments: Array<{
                    id: number;
                    file: {
                        originalName?: string;
                        mimeType: string;
                        sizeBytes: number;
                    };
                }>;
            };
            let details: CanonicalDetails | undefined;
            if (token) {
                try {
                    details = await publicGet<CanonicalDetails>(
                        `/api/public/service-requests/${encodeURIComponent(token)}`,
                    );
                } catch {
                    details = undefined;
                }
            }
            if (!details) {
                const requests = await get<
                    Array<{
                        request: CanonicalDetails['request'];
                        messages: CanonicalDetails['messages'];
                        attachments: CanonicalDetails['attachments'];
                    }>
                >('/api/client/service-requests');
                details = requests.find(
                    (item) =>
                        item.request.requestNumber.toLowerCase() ===
                        number.trim().toLowerCase(),
                );
            }
            if (!details) return null;
            if (token) {
                localStorage.setItem(
                    `vitma_service_token_${details.request.requestNumber}`,
                    token,
                );
            }
            const status = toClientServiceStatus(
                details.request.customerStatus,
            );
            return {
                id: details.request.id,
                number: details.request.requestNumber,
                createdAt: new Date(details.request.createdAt).toLocaleString(
                    'ru-RU',
                ),
                status,
                title: details.request.serviceTypeTitle,
                contactName:
                    details.request.contactSnapshot?.name || 'Клиент сайта',
                accessToken: token,
                attachments: details.attachments.map((attachment) => ({
                    id: attachment.id,
                    name:
                        attachment.file.originalName || `Файл ${attachment.id}`,
                    mimeType: attachment.file.mimeType,
                    sizeBytes: attachment.file.sizeBytes,
                })),
                history: details.messages.length
                    ? details.messages.map((message) => ({
                          status,
                          title: message.text || serviceStatusTitle(status),
                          date: new Date(message.createdAt).toLocaleString(
                              'ru-RU',
                          ),
                      }))
                    : [
                          {
                              status,
                              title: serviceStatusTitle(status),
                              date: new Date(
                                  details.request.createdAt,
                              ).toLocaleString('ru-RU'),
                          },
                      ],
            };
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        const local = JSON.parse(
            localStorage.getItem(REQUESTS_KEY) || '[]',
        ) as ServiceRequestRecord[];
        return (
            [...local, ...demoRequests].find(
                (item) =>
                    item.number.toLowerCase() === number.trim().toLowerCase(),
            ) ?? null
        );
    },
    async reply(request: ServiceRequestRecord, text: string, file?: File) {
        const token =
            request.accessToken ||
            localStorage.getItem(`vitma_service_token_${request.number}`) ||
            undefined;
        if (!token && !request.id) {
            throw new Error('Не удалось подтвердить доступ к заявке');
        }
        if (text.trim()) {
            if (token) {
                await publicPost(
                    `/api/public/service-requests/${encodeURIComponent(token)}/messages`,
                    { text },
                );
            } else {
                await post(
                    `/api/client/service-requests/${request.id}/messages`,
                    {
                        text,
                    },
                );
            }
        }
        if (file) {
            if (token) {
                await publicUpload(
                    `/api/public/service-requests/${encodeURIComponent(token)}/messages/attachments`,
                    file,
                );
            } else {
                await upload(
                    `/api/client/service-requests/${request.id}/messages/attachments`,
                    file,
                );
            }
        }
        return this.find(request.number, token);
    },
};

const toClientServiceStatus = (status: string): ServiceRequestStatus => {
    if (status === 'completed') return 'completed';
    if (status === 'cancelled' || status === 'closed') return 'closed';
    if (status === 'accepted' || status === 'scheduled') return 'assigned';
    if (
        status === 'waiting_for_customer' ||
        status === 'clarification_required'
    )
        return 'waiting';
    return 'accepted';
};

const serviceStatusTitle = (status: ServiceRequestStatus) =>
    ({
        accepted: 'Заявка принята',
        assigned: 'Заявка передана специалисту',
        diagnostics: 'Проводится диагностика',
        waiting: 'Ожидается оплата',
        completed: 'Работа выполнена',
        closed: 'Заявка закрыта',
    })[status];

export interface RegistrationFieldDto {
    name: string;
    label: string;
}

export const registrationService = {
    async getFields(): Promise<RegistrationFieldDto[]> {
        await ensureWebSession();
        const response = await fetch('/api/client/registration-fields', {
            credentials: 'include',
        });
        if (!response.ok) throw new Error('Не удалось загрузить поля анкеты');
        return response.json() as Promise<RegistrationFieldDto[]>;
    },
    async submit(values: Record<string, string>) {
        return post<{ data: { id: number } }>(
            '/api/client/registrations/form',
            {
                values,
            },
        );
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
