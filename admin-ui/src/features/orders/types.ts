export const orderStatuses = {
    submitted: 'Новый',
    in_review: 'На согласовании',
    confirmed: 'Согласован',
    waiting_payment: 'Ожидает оплаты',
    paid: 'Оплачен',
    fulfilled: 'Исполнен',
    completed: 'Завершён',
    cancelled: 'Отменён',
};
export type OrderStatus = keyof typeof orderStatuses;
export const actionLabels = {
    assign: 'Назначить менеджера',
    review: 'Начать согласование',
    quote: 'Изменить предложение',
    confirm: 'Согласовать заказ',
    invoice: 'Загрузить счёт',
    payment: 'Подтвердить оплату',
    fulfill: 'Подтвердить исполнение',
    complete: 'Завершить заказ',
};
export type OrderAction = keyof typeof actionLabels;
export interface ActionDecision {
    allowed: boolean;
    reason: 'permission' | 'state' | 'assignment' | 'inconsistent' | null;
}
export const reasonLabels = {
    permission: 'Недостаточно прав',
    state: 'Недоступно на текущем этапе',
    assignment: 'Действие доступно назначенному менеджеру',
    inconsistent: 'Не хватает согласованных данных заказа',
};
export interface Manager {
    id: number;
    displayName: string;
    isActive?: boolean;
}
export interface QuoteSummary {
    status: 'draft' | 'confirmed';
    revision: number;
    hasUnpricedItems: boolean;
    quotedTotalMinor: string | null;
    quotedPricedSubtotalMinor: string;
    currency: string;
}
export interface OrderSummary {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    version: number;
    customerType: 'individual' | 'organization';
    organization: {
        id: number | null;
        name: string;
        inn: string;
        kpp: string | null;
        legalAddress?: string;
        actualAddress?: string;
    } | null;
    contact: { name: string; phone: string; email: string | null };
    assignedManager: Manager | null;
    itemCount: number;
    quote: QuoteSummary | null;
    catalogTotalMinor: string | null;
    hasCurrentInvoice: boolean;
    invoiceRevision: number | null;
    paymentProofCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface OrderList {
    items: OrderSummary[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface OrderLine {
    productId: number;
    nameSnapshot: string;
    skuSnapshot: string;
    quantity: number;
    catalogUnitPriceMinor: string | null;
    catalogLineTotalMinor: string | null;
    quotedUnitPriceMinor?: string | null;
    quotedLineTotalMinor?: string | null;
}
export interface OrderDocument {
    id: number;
    type: 'invoice' | 'payment_proof';
    status: 'active' | 'superseded';
    revision: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    downloadUrl: string | null;
    available: boolean;
    quoteRevisionSnapshot?: number;
    amountMinorSnapshot?: string;
    uploadedBy?: Manager | { name: string } | null;
}
export interface OrderDetail extends OrderSummary {
    delivery: {
        type: string;
        city: string | null;
        address: string | null;
        comment: string | null;
    };
    customerComment: string | null;
    lines: OrderLine[];
    quote:
        | (QuoteSummary & {
              internalComment: string | null;
              lines: OrderLine[];
              confirmedAt: string | null;
          })
        | null;
    documents: { invoices: OrderDocument[]; paymentProofs: OrderDocument[] };
    paymentConfirmation: {
        receivedAt: string;
        confirmedAt: string;
        source: string;
        comment: string | null;
        confirmedByStaff: Manager | null;
    } | null;
    fulfillment: {
        method: string;
        fulfilledAt: string;
        recipientName: string | null;
        carrierName: string | null;
        trackingNumber: string | null;
        comment: string | null;
        fulfilledByStaff: Manager | null;
    } | null;
    completion: {
        realizationNumber: string;
        realizationDate: string;
        documentDeliveryMethod: string;
        documentKinds: string[] | null;
        documentsDeliveredAt: string | null;
        comment: string | null;
        completedAt: string;
        completedByStaff: Manager | null;
    } | null;
    events: Array<{
        id: number;
        type: string;
        createdAt: string;
        actorStaffId: number | null;
        actor: Manager | null;
        message: string | null;
        metadata: Record<string, string | number>;
        toStatus: OrderStatus | null;
    }>;
    history: { limit: number; hasMore: boolean };
    actions: Record<OrderAction, ActionDecision>;
}
export const fulfillmentMethods: Record<string, string> = {
    pickup: 'Самовывоз',
    courier: 'Курьер',
    transport_company: 'Транспортная компания',
    service_only: 'Только услуги',
    mixed: 'Смешанное исполнение',
};
export const paymentSources: Record<string, string> = {
    bank_statement: 'Банковская выписка',
    payment_order: 'Платёжное поручение',
    customer_confirmation: 'Подтверждение клиента',
    other: 'Другое основание',
};
export const documentMethods: Record<string, string> = {
    edo: 'ЭДО',
    paper: 'Бумажные документы',
    mixed: 'ЭДО и бумага',
    not_required: 'Не требуются',
};
export const documentKinds: Record<string, string> = {
    upd: 'УПД',
    invoice_factura: 'Счёт-фактура',
    torg12: 'ТОРГ-12',
    act: 'Акт',
    other: 'Другой документ',
};
