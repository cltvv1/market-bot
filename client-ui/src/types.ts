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
