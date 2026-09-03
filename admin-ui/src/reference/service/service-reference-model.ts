import type {
    Admin,
    ServiceRequest,
    ServiceAttachment,
    ServiceEvent,
    ServiceMessage,
    Staff,
} from '../../types';

// These fields are already serialized by adminView; legacy UI types omit them.
export interface ReferenceRequest extends ServiceRequest {
    updatedAt?: string;
    visitAddress?: string | null;
    visitTime?: string | null;
}
export interface ReferenceDetail {
    request: ReferenceRequest;
    attachments: ServiceAttachment[];
    events: ServiceEvent[];
    messages: ServiceMessage[];
}
export const statuses = [
    'all',
    'active',
    'draft',
    'submitted',
    'price_confirmed',
    'review_required',
    'clarification_required',
    'invoice_required',
    'waiting_payment',
    'paid',
    'scheduled',
    'in_progress',
    'completed',
    'closed',
    'cancelled',
];
export const priorities = ['', 'low', 'normal', 'high', 'urgent'];
export const platforms = ['', 'web', 'telegram', 'max'];
export const pageSizes = [10, 20, 50];
export const canReadService = (admin: Admin) =>
    admin.permissions.some((p) =>
        ['serviceRequests.read.all', 'serviceRequests.read.assigned'].includes(
            p,
        ),
    );
export const textValue = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function clientName(request: ReferenceRequest) {
    return (
        textValue(request.organizationSnapshot?.name) ||
        textValue(request.contactSnapshot?.name) ||
        textValue(request.answers?.clientName) ||
        'Клиент не указан'
    );
}
export function staffName(
    id: number | undefined,
    admin: Admin,
    staff: Staff[],
) {
    if (!id) return 'Не назначен';
    return id === admin.id
        ? admin.displayName
        : staff.find((item) => item.id === id)?.displayName ||
              `Сотрудник #${id}`;
}
export function queueState(params: URLSearchParams) {
    const oneOf = (key: string, values: string[], fallback: string) =>
        values.includes(params.get(key) || '')
            ? params.get(key) || fallback
            : fallback;
    const requestedPage = Number(params.get('page'));
    const requestedLimit = Number(params.get('limit'));
    const responsible = params.get('responsible') || '';
    return {
        status: oneOf('status', statuses, 'all'),
        priority: oneOf('priority', priorities, ''),
        platform: oneOf('platform', platforms, ''),
        responsible: /^\d{1,10}$/.test(responsible) ? responsible : '',
        page:
            Number.isSafeInteger(requestedPage) && requestedPage > 0
                ? Math.min(requestedPage, 1000)
                : 1,
        limit: pageSizes.includes(requestedLimit) ? requestedLimit : 10,
    };
}
export function filterResult(
    items: ReferenceRequest[],
    priority: string,
    responsible: string,
) {
    return items.filter(
        (item) =>
            (!priority || (item.priority || 'normal') === priority) &&
            (!responsible ||
                String(item.responsibleOperatorStaffId) === responsible ||
                String(item.assignedEngineerId) === responsible),
    );
}
export const channelName = (source?: string) =>
    ({
        web: 'Сайт',
        telegram: 'Telegram',
        max: 'MAX',
        phone: 'Телефон',
        admin: 'Админка',
        integration: 'Интеграция',
    })[source || ''] || 'Не указан';

export function paymentDocument(
    data: ReferenceDetail,
    kind: 'invoice' | 'payment_proof',
) {
    const id =
        kind === 'invoice'
            ? data.request.invoiceStoredFileId
            : data.request.paymentProofFileId;
    return data.attachments.find(
        (attachment) => attachment.file.id === id && attachment.kind === kind,
    );
}
