export type Availability =
    | 'in_stock'
    | 'low_stock'
    | 'on_request'
    | 'unavailable';
export interface Category {
    id: number;
    slug: string;
    name: string;
    parentId: number | null;
    description: string | null;
}
export interface Product {
    id: number;
    slug: string;
    sku: string;
    name: string;
    brand: string | null;
    category: Pick<Category, 'id' | 'slug' | 'name'>;
    shortDescription: string | null;
    description: string | null;
    displayPriceMinor: number | null;
    vatRate: number;
    availabilityStatus: Availability;
    features: string[];
    specifications: Record<string, string>;
    packageContents: string[];
    isPopular: boolean;
    isNew: boolean;
}
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface CartLine {
    productId: number;
    quantity: number;
}
export interface CartItem extends CartLine {
    product: Product | null;
}
export interface OrderSubmission {
    customerType: 'organization' | 'individual';
    organizationId?: number;
    organization?: { name: string; inn: string; kpp?: string };
    contact: { name: string; phone: string; email?: string };
    delivery: {
        type: 'pickup' | 'courier' | 'transport_company';
        city?: string;
        address?: string;
        comment?: string;
    };
    comment?: string;
    items: CartLine[];
}
export type OrderStatus =
    | 'submitted'
    | 'in_review'
    | 'confirmed'
    | 'waiting_payment'
    | 'paid'
    | 'fulfilled'
    | 'completed'
    | 'cancelled';
export interface OrderLine {
    productId: number;
    position: number;
    skuSnapshot: string;
    slugSnapshot: string;
    nameSnapshot: string;
    quantity: number;
    catalogUnitPriceMinor?: string | null;
    catalogLineTotalMinor?: string | null;
    quotedUnitPriceMinor?: string | null;
    quotedLineTotalMinor?: string | null;
}
export interface OrderDocument {
    id: number;
    type: 'invoice' | 'payment_proof';
    originalName: string;
    revision: number;
    sha256: string;
    sizeBytes: string;
    mimeType: string;
    createdAt: string;
    downloadUrl: string | null;
    available: boolean;
}
export interface OrderSummary {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    version: number;
    itemCount: number;
    customerType: OrderSubmission['customerType'];
    organization: {
        id: number | null;
        name: string;
        inn: string;
        kpp: string | null;
    } | null;
    contact: { name: string; phone: string; email: string | null };
    catalogPricedSubtotalMinor: string;
    hasUnpricedItems: boolean;
    catalogTotalMinor: string | null;
    confirmedQuote: {
        revision: number;
        quotedTotalMinor: string;
        lines?: OrderLine[];
    } | null;
    createdAt: string;
    updatedAt: string;
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
    documents: {
        currentInvoice: OrderDocument | null;
        paymentProofs: OrderDocument[];
    };
    payment: { receivedAt: string; confirmedAt: string } | null;
    fulfillment: {
        method: string;
        fulfilledAt: string;
        recipientName: string | null;
        carrierName: string | null;
        trackingNumber: string | null;
    } | null;
    completion: {
        completedAt: string;
        realizationNumber: string;
        realizationDate: string;
        documentDeliveryMethod: string;
        documentKinds: string[];
        documentsDeliveredAt: string | null;
    } | null;
    events: {
        id: number;
        type: string;
        message: string | null;
        createdAt: string;
        toStatus: OrderStatus | null;
    }[];
}
