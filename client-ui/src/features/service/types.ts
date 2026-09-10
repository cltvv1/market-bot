export type Answer = string | number | boolean | string[] | null;
export type Answers = Record<string, Answer>;
export interface FormField {
    key: string;
    type:
        | 'text'
        | 'textarea'
        | 'phone'
        | 'email'
        | 'number'
        | 'boolean'
        | 'date'
        | 'select'
        | 'multiselect'
        | 'address'
        | 'organization'
        | 'equipment'
        | 'display'
        | 'file_instruction';
    label: string;
    required?: boolean;
    maxLength?: number;
    min?: number;
    max?: number;
    options?: { value: string; label: string }[];
    condition?: { field: string; equals: string | number | boolean };
}
export interface OwnerForm {
    id: number;
    version: number;
    status: string;
    supported: boolean;
    schema: {
        fields: FormField[];
        attachmentInstruction?: string;
        maxAttachments: number;
    };
}
export interface ServiceType {
    code: string;
    title: string;
    description: string | null;
    formVersion: OwnerForm | null;
}
export interface RequestSummary {
    id: number;
    requestNumber: string;
    serviceTypeCode: string;
    serviceTypeTitle: string;
    stage: string;
    stageLabel: string;
    isDraft: boolean;
    canContinue: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface Capability {
    allowed: boolean;
    reason: string | null;
}
export interface DocumentFile {
    id: number;
    kind: string;
    createdAt: string;
    file: {
        originalName: string | null;
        mimeType: string | null;
        sizeBytes: number | null;
    };
    downloadable: boolean;
    downloadUrl: string | null;
}
export interface PaymentProof {
    attachmentId: number | null;
    kind: 'payment_proof';
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string | null;
    downloadable: boolean;
    downloadUrl: string | null;
}
export interface OwnerDetail {
    request: RequestSummary & {
        version: number;
        answers: Answers;
        contactSnapshot: {
            name: string;
            phone?: string;
            email?: string;
            preferredChannel: string;
        } | null;
        organizationSnapshot: Record<string, unknown> | null;
        locationSnapshot: Record<string, unknown> | null;
        equipmentSnapshot: Record<string, unknown> | null;
        linkedOrganization: boolean;
        linkedEquipment: boolean;
        submittedAt: string | null;
        completedAt: string | null;
        closedAt: string | null;
        cancelledAt: string | null;
        visitTime: string | null;
        visitAddress: string | null;
        calculatedPrice: number | null;
    };
    form: OwnerForm | null;
    messages: {
        id: number;
        authorType: string;
        text: string | null;
        createdAt: string;
        attachmentId: number | null;
    }[];
    events: { id: number; type: string; label: string; createdAt: string }[];
    attachments: DocumentFile[];
    documents: {
        invoice: DocumentFile | null;
        paymentProof: PaymentProof | null;
    };
    customerWorkflow: {
        expectedVersion: number;
        paymentProof: Capability & {
            replacement: boolean;
            reasonCode: string | null;
        };
        editDraft: Capability;
        submitDraft: Capability;
        sendMessage: Capability;
        attachFile: Capability;
    };
    attachmentPolicy: {
        maxBytes: number;
        mimeTypes: string[];
        extensions: string[];
        maxAttachments: number;
    };
}
export interface DraftResult {
    id: number;
    version: number;
    status: string;
    created?: boolean;
}
export interface PublicDetail {
    request: {
        requestNumber: string;
        serviceTypeTitle: string;
        customerStatus: string;
        createdAt: string;
    };
    messages: {
        id: number;
        authorType: string;
        text: string | null;
        createdAt: string;
    }[];
}
