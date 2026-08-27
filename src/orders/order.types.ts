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
    'manager_assigned',
    'manager_reassigned',
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
export const ORDER_PAGE_NUMBER_MAX = 100_000;
export const ORDER_ITEM_COUNT_MAX = 100;
export const ORDER_ITEM_QUANTITY_MAX = 1000;
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const ORDER_QUOTE_STATUSES = ['draft', 'confirmed'] as const;
export type OrderQuoteStatus = (typeof ORDER_QUOTE_STATUSES)[number];

export const ORDER_ASSIGNMENT_SCOPES = ['all', 'mine', 'unassigned'] as const;
export type OrderAssignmentScope = (typeof ORDER_ASSIGNMENT_SCOPES)[number];

export const ORDER_MONEY_MAX_MINOR_TEXT = '99999999999999999999';
export const ORDER_MONEY_MAX_MINOR = BigInt(ORDER_MONEY_MAX_MINOR_TEXT);
export const ORDER_INTERNAL_COMMENT_MAX_LENGTH = 2000;
