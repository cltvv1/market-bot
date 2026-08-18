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

export interface ServiceTypeOption {
    code: string;
    title: string;
    description?: string;
    flow: 'simple' | 'fn_replacement';
    settings?: {
        prices?: Record<string, number>;
    } | null;
}

export type ServiceRequestStatus =
    | 'accepted'
    | 'assigned'
    | 'diagnostics'
    | 'waiting'
    | 'completed'
    | 'closed';

export interface ServiceRequestFormData {
    clientType: 'person' | 'organization';
    organization: string;
    inn: string;
    contactName: string;
    phone: string;
    email: string;
    city: string;
    address: string;
    equipmentType: string;
    equipmentModel: string;
    serialNumber: string;
    software: string;
    problemType: string;
    fiscalDriveTerm: '15' | '36';
    urgency: 'normal' | 'urgent' | 'critical';
    helpFormat: 'remote' | 'visit' | 'workshop';
    description: string;
    files: File[];
    consent: boolean;
}

export interface ServiceRequestRecord {
    number: string;
    createdAt: string;
    status: ServiceRequestStatus;
    title: string;
    contactName: string;
    history: Array<{
        status: ServiceRequestStatus;
        title: string;
        date: string;
        note?: string;
    }>;
}
