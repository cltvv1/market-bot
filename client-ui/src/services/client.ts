import { demoRequests } from '../data/services';
import type {
    OrderFormData,
    ServiceRequestFormData,
    ServiceRequestRecord,
    ServiceRequestStatus,
    ServiceTypeOption,
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
            const started = await post<{
                request: {
                    id: number;
                    serviceTypeTitle: string;
                    createdAt: string;
                    currentStep: number;
                };
            }>('/api/client/service-requests/start', {
                name: data.contactName,
                serviceTypeCode: data.problemType,
            });
            const equipment = [
                data.equipmentType,
                data.equipmentModel,
                data.serialNumber,
            ]
                .filter(Boolean)
                .join(', ');
            const summary = [
                data.description,
                `Оборудование: ${equipment}`,
                data.software ? `Программа: ${data.software}` : '',
                data.organization ? `Организация: ${data.organization}` : '',
                data.email ? `Email: ${data.email}` : '',
                data.city ? `Город: ${data.city}` : '',
                data.address ? `Адрес: ${data.address}` : '',
                `Формат: ${data.helpFormat}`,
                `Срочность: ${data.urgency}`,
            ]
                .filter(Boolean)
                .join('. ');
            const answers =
                data.problemType === 'fn_replacement'
                    ? [data.inn, equipment, data.fiscalDriveTerm, data.phone]
                    : [summary, data.phone];
            for (const value of answers.slice(started.request.currentStep)) {
                await post(
                    `/api/client/service-requests/${started.request.id}/answers`,
                    { name: data.contactName, value },
                );
            }
            if (data.problemType === 'fn_replacement') {
                await post(
                    `/api/client/service-requests/${started.request.id}/confirm-price`,
                    { name: data.contactName },
                );
            }
            return {
                number: `SR-${started.request.id}`,
                createdAt: new Date(started.request.createdAt).toLocaleString(
                    'ru-RU',
                ),
                status: 'accepted',
                title: started.request.serviceTypeTitle,
                contactName: data.contactName,
                history: [
                    {
                        status: 'accepted',
                        title: 'Заявка принята',
                        date: new Date().toLocaleString('ru-RU'),
                    },
                ],
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
    async find(number: string): Promise<ServiceRequestRecord | null> {
        if (useRealServiceApi) {
            const match = /^SR-(\d+)$/i.exec(number.trim());
            if (!match) return null;
            const requests = await get<
                Array<{
                    id: number;
                    serviceTypeTitle: string;
                    status: string;
                    createdAt: string;
                }>
            >('/api/client/service-requests');
            const request = requests.find(
                (item) => item.id === Number(match[1]),
            );
            if (!request) return null;
            const status = toClientServiceStatus(request.status);
            return {
                number: `SR-${request.id}`,
                createdAt: new Date(request.createdAt).toLocaleString('ru-RU'),
                status,
                title: request.serviceTypeTitle,
                contactName: 'Клиент сайта',
                history: [
                    {
                        status,
                        title: serviceStatusTitle(status),
                        date: new Date(request.createdAt).toLocaleString(
                            'ru-RU',
                        ),
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
};

const toClientServiceStatus = (status: string): ServiceRequestStatus => {
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'closed';
    if (status === 'paid' || status === 'scheduled') return 'assigned';
    if (status === 'waiting_payment') return 'waiting';
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
