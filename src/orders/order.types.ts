export const ORDER_STATUSES = [
    'submitted',
    'in_review',
    'confirmed',
    'waiting_payment',
    'paid',
    'fulfilled',
    'completed',
    'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_CUSTOMER_TYPES = ['organization', 'individual'] as const;
export type OrderCustomerType = (typeof ORDER_CUSTOMER_TYPES)[number];

export const ORDER_DELIVERY_TYPES = [
    'pickup',
    'courier',
    'transport_company',
] as const;
export type OrderDeliveryType = (typeof ORDER_DELIVERY_TYPES)[number];

export const ORDER_EVENT_TYPES = [
    'submitted',
    'review_started',
    'quote_updated',
    'confirmed',
    'invoice_issued',
    'payment_proof_received',
    'payment_confirmed',
    'fulfilled',
    'completed',
    'cancelled',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const ORDER_EVENT_ACTOR_TYPES = ['customer', 'staff', 'system'] as const;
export type OrderEventActorType = (typeof ORDER_EVENT_ACTOR_TYPES)[number];

export const ORDER_EVENT_VISIBILITIES = ['customer', 'staff'] as const;
export type OrderEventVisibility = (typeof ORDER_EVENT_VISIBILITIES)[number];

export const ORDER_PAGE_SIZE_DEFAULT = 20;
export const ORDER_PAGE_SIZE_MAX = 100;
export const ORDER_ITEM_COUNT_MAX = 100;
export const ORDER_ITEM_QUANTITY_MAX = 1000;
