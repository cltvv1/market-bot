import { demoRequests } from '../data/services';
import type {
    OrderFormData,
    ServiceRequestFormData,
    ServiceRequestRecord,
} from '../types';

const REQUESTS_KEY = 'vitma_service_requests';
const useRealServiceApi = import.meta.env.VITE_USE_REAL_SERVICE_API === 'true';
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
    async create(data: ServiceRequestFormData): Promise<ServiceRequestRecord> {
        if (useRealServiceApi) {
            const started = await post<{ request: { id: number } }>(
                '/api/client/service-requests/start',
                {
                    name: data.contactName,
                    serviceTypeCode: 'kkt_remote_work',
                },
            );
            const summary = `${data.problemType}. ${data.equipmentType} ${data.equipmentModel}. ${data.description}. Формат: ${data.helpFormat}. Срочность: ${data.urgency}.`;
            await post(
                `/api/client/service-requests/${started.request.id}/answers`,
                { name: data.contactName, value: summary },
            );
            await post(
                `/api/client/service-requests/${started.request.id}/answers`,
                { name: data.contactName, value: data.phone },
            );
            return {
                number: `SR-${started.request.id}`,
                createdAt: new Date().toLocaleString('ru-RU'),
                status: 'accepted',
                title: data.problemType,
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
