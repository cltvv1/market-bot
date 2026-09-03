import type { Priority } from '../../types';
export type StaffIdentity = {
    id: number;
    displayName: string;
    isActive: boolean;
};
export type Contact = { name: string; phone?: string; email?: string };
export interface ServiceRow {
    id: number;
    requestNumber: string;
    serviceTypeCode: string;
    serviceTypeTitle: string;
    status: string;
    customerStatus: string;
    priority: Priority;
    source: string;
    platform: string;
    contact: Contact;
    organization: {
        id: number | null;
        name: string | null;
        inn: string | null;
    };
    equipment: string;
    responsibleOperator: StaffIdentity | null;
    assignedEngineer: StaffIdentity | null;
    hasInvoice: boolean;
    hasPaymentProof: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export type ServicePage = {
    items: ServiceRow[];
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
};
export interface ServiceDocument {
    id: number;
    attachmentId: number | null;
    kind: string;
    originalName: string;
    mimeType: string | null;
    sizeBytes: number;
    createdAt: string;
    customerVisible: boolean;
    downloadable: boolean;
    unavailableReasonCode: string | null;
    downloadUrl: string | null;
}
export type ActionId =
    | 'assign_engineer'
    | 'update_operator_state'
    | 'send_customer_message'
    | 'add_internal_note'
    | 'submit_request'
    | 'mark_review_required'
    | 'request_clarification'
    | 'mark_invoice_required'
    | 'upload_invoice'
    | 'replace_invoice'
    | 'confirm_payment'
    | 'schedule_visit'
    | 'reschedule_visit'
    | 'start_work'
    | 'complete_work'
    | 'close_request'
    | 'cancel_request';
export type ServiceAction = {
    id: ActionId;
    allowed: boolean;
    reason: string | null;
    reasonCode: string | null;
    targetStatus: string | null;
    expectedVersion: number;
};
export interface ServiceDetailData {
    request: ServiceRow & {
        answers: Record<string, unknown>;
        contactSnapshot: Contact;
        organizationSnapshot?: Record<string, unknown>;
        equipmentSnapshot?: Record<string, unknown>;
        locationSnapshot?: Record<string, unknown>;
        calculatedPrice: number | null;
        operatorComment: string | null;
        visitAddress: string | null;
        visitTime: string | null;
        invoiceStoredFileId: number | null;
        paymentProofFileId: number | null;
    };
    workflow: {
        expectedVersion: number;
        primaryActionId: ActionId | null;
        actions: ServiceAction[];
    };
    messages: Array<{
        id: number;
        authorType: string;
        author: StaffIdentity | null;
        visibility: 'customer' | 'internal';
        text: string;
        createdAt: string;
        attachment: ServiceDocument | null;
    }>;
    attachments: ServiceDocument[];
    documents: {
        invoice: ServiceDocument | null;
        paymentProof: ServiceDocument | null;
        attachments: ServiceDocument[];
    };
    events: Array<{
        id: number;
        type: string;
        actor: string;
        actorStaff?: {
            id: number;
            displayName: string;
            isActive: boolean;
        } | null;
        message: string;
        createdAt: string;
    }>;
    deliveries: Array<{
        id: number;
        status: string;
        createdAt: string;
        lastErrorCode?: string | null;
    }>;
}
export const actionLabels: Record<ActionId, string> = {
    assign_engineer: 'Назначить инженера',
    update_operator_state: 'Приоритет и комментарий',
    send_customer_message: 'Ответить клиенту',
    add_internal_note: 'Внутренняя заметка',
    submit_request: 'Отправить на рассмотрение',
    mark_review_required: 'На проверку',
    request_clarification: 'Запросить уточнение',
    mark_invoice_required: 'Подготовить счёт',
    upload_invoice: 'Загрузить счёт',
    replace_invoice: 'Заменить счёт',
    confirm_payment: 'Подтвердить оплату',
    schedule_visit: 'Назначить визит',
    reschedule_visit: 'Перенести визит',
    start_work: 'Начать работу',
    complete_work: 'Завершить работу',
    close_request: 'Закрыть заявку',
    cancel_request: 'Отменить заявку',
};
export const channels: Record<string, string> = {
    phone: 'Телефон',
    admin: 'Сотрудник',
    web: 'Сайт',
    telegram: 'Telegram',
    max: 'MAX',
};
export const contactName = (row: ServiceRow) =>
    row.organization.name || row.contact.name || 'Контакт не указан';
