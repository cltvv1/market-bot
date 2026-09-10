export type StockStatus = 'in_stock' | 'low_stock' | 'on_order';

export interface Category {
    id: string;
    name: string;
    description: string;
    icon: string;
}

export interface Product {
    id: string;
    slug: string;
    sku: string;
    name: string;
    categoryId: string;
    brand: string;
    price: number;
    oldPrice?: number;
    stock: StockStatus;
    shortDescription: string;
    description: string;
    features: string[];
    specifications: Record<string, string>;
    packageContents: string[];
    popular?: boolean;
    new?: boolean;
    imageTone: 'graphite' | 'green' | 'blue' | 'silver';
}

export interface CartLine {
    productId: string;
    quantity: number;
}

export interface OrderFormData {
    name: string;
    phone: string;
    email: string;
    organization: string;
    inn: string;
    city: string;
    address: string;
    delivery: 'pickup' | 'courier' | 'transport';
    payment: 'invoice' | 'card' | 'cash';
    comment: string;
}

export interface ServiceDirection {
    id: string;
    title: string;
    description: string;
    timing: string;
    icon: string;
}

export type OrganizationAccessStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'cancelled';

export interface OrganizationAccessRequest {
    id: number;
    status: OrganizationAccessStatus;
    requestedRole: 'representative';
    organization: {
        id: number;
        name: string | null;
        inn: string;
    };
    submittedName?: string | null;
    submittedPhone?: string | null;
    submittedEmail?: string | null;
    comment?: string | null;
    createdAt: string;
    updatedAt: string;
    reviewedAt: string | null;
    cancelledAt: string | null;
}

export interface OrganizationMembership {
    id: number;
    role: string;
    organizationId: number;
    organization: {
        id: number;
        name: string | null;
        inn: string;
        kpp?: string | null;
    };
}

export interface OrganizationAccessFormData {
    organizationName: string;
    inn: string;
    kpp: string;
    name: string;
    phone: string;
    email: string;
    comment: string;
}
