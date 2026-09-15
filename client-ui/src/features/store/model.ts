import type {
    Availability,
    CartItem,
    CartLine,
    OrderStatus,
    OrderSubmission,
    Product,
} from './types';

export const CART_KEY = 'vitma_cart';
export const ID_MAX = 2147483647;
export const LINE_MAX = 100;
export const QUANTITY_MAX = 1000;
export const availabilityLabels: Record<Availability, string> = {
    in_stock: 'В наличии',
    low_stock: 'Осталось мало',
    on_request: 'Под заказ',
    unavailable: 'Недоступен',
};
export const orderLabels: Record<OrderStatus, string> = {
    submitted: 'Заказ передан',
    in_review: 'Менеджер проверяет заказ',
    confirmed: 'Заказ согласован',
    waiting_payment: 'Ожидается оплата',
    paid: 'Оплата подтверждена',
    fulfilled: 'Заказ исполнен',
    completed: 'Заказ завершён',
    cancelled: 'Заказ отменён',
};
export const deliveryLabels: Record<string, string> = {
    pickup: 'Самовывоз',
    courier: 'Курьер',
    transport_company: 'Транспортная компания',
    service_only: 'Оказание услуги',
    mixed: 'Смешанный',
};
export function integer(value: unknown, max = ID_MAX): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= max
    );
}
// Strip every property except the two allowed values; the first valid duplicate wins.
export function parseCart(raw: string | null): CartLine[] {
    try {
        if (!raw || raw.length > 100_000) return [];
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value)) return [];
        const unique = new Map<number, CartLine>();
        for (const item of value as unknown[]) {
            if (
                item &&
                typeof item === 'object' &&
                'productId' in item &&
                'quantity' in item &&
                integer(item.productId) &&
                integer(item.quantity, QUANTITY_MAX) &&
                !unique.has(item.productId)
            )
                unique.set(item.productId, {
                    productId: item.productId,
                    quantity: item.quantity,
                });
            if (unique.size === LINE_MAX) break;
        }
        return [...unique.values()];
    } catch {
        return [];
    }
}
export function hydrateCart(
    lines: CartLine[],
    products: Product[],
): CartItem[] {
    const byId = new Map(products.map((product) => [product.id, product]));
    return lines.map((line) => ({
        ...line,
        product: byId.get(line.productId) ?? null,
    }));
}
export const orderable = (product: Product | null) =>
    !!product && product.availabilityStatus !== 'unavailable';
export function cartTotals(items: CartItem[]) {
    let subtotal = 0n;
    let unpriced = false;
    for (const { product, quantity } of items) {
        if (!product || product.displayPriceMinor === null) unpriced = true;
        else subtotal += BigInt(product.displayPriceMinor) * BigInt(quantity);
    }
    return {
        subtotal: subtotal.toString(),
        unpriced,
        blocked:
            !items.length || items.some((item) => !orderable(item.product)),
    };
}
export function moneyMinor(value: number | string | null | undefined) {
    if (value === null || value === undefined) return 'Цена по запросу';
    const minor = BigInt(value);
    return `${(minor / 100n).toLocaleString('ru-RU')},${String(minor % 100n).padStart(2, '0')} ₽`;
}
export interface CheckoutFields {
    customerType: OrderSubmission['customerType'];
    organizationId: string;
    organizationName: string;
    inn: string;
    kpp: string;
    name: string;
    phone: string;
    email: string;
    deliveryType: OrderSubmission['delivery']['type'];
    city: string;
    address: string;
    deliveryComment: string;
    comment: string;
}
export const initialCheckout: CheckoutFields = {
    customerType: 'organization',
    organizationId: '',
    organizationName: '',
    inn: '',
    kpp: '',
    name: '',
    phone: '',
    email: '',
    deliveryType: 'pickup',
    city: '',
    address: '',
    deliveryComment: '',
    comment: '',
};
export function checkoutPayload(
    fields: CheckoutFields,
    lines: CartLine[],
): OrderSubmission {
    if (
        !lines.length ||
        lines.length > LINE_MAX ||
        lines.some(
            (line) =>
                !integer(line.productId) ||
                !integer(line.quantity, QUANTITY_MAX),
        )
    )
        throw new Error('Проверьте состав корзины.');
    const organizationId = Number(fields.organizationId);
    if (
        fields.customerType === 'organization' &&
        fields.organizationId &&
        !integer(organizationId)
    )
        throw new Error('Выберите доступную организацию.');
    return {
        customerType: fields.customerType,
        ...(fields.customerType === 'organization'
            ? fields.organizationId
                ? { organizationId }
                : {
                      organization: {
                          name: fields.organizationName.trim(),
                          inn: fields.inn.trim(),
                          ...(fields.kpp.trim()
                              ? { kpp: fields.kpp.trim() }
                              : {}),
                      },
                  }
            : {}),
        contact: {
            name: fields.name.trim(),
            phone: fields.phone.trim(),
            ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
        },
        delivery: {
            type: fields.deliveryType,
            ...(fields.city.trim() ? { city: fields.city.trim() } : {}),
            ...(fields.address.trim()
                ? { address: fields.address.trim() }
                : {}),
            ...(fields.deliveryComment.trim()
                ? { comment: fields.deliveryComment.trim() }
                : {}),
        },
        ...(fields.comment.trim() ? { comment: fields.comment.trim() } : {}),
        items: lines.map(({ productId, quantity }) => ({
            productId,
            quantity,
        })),
    };
}
