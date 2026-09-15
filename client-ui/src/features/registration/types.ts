export type RegistrationStatus = 'draft' | 'new' | 'in_work' | 'processed';
export type Readiness =
    | 'incomplete'
    | 'awaiting_customer'
    | 'awaiting_verification'
    | 'ready';
export type RequirementKind = 'kkt_serial' | 'fiscal_drive_serial' | 'ofd_code';
export type RequirementStatus =
    | 'missing'
    | 'requested'
    | 'provided'
    | 'verified'
    | 'not_required';
export interface RegistrationField {
    name: string;
    label: string;
    step: number;
    required: boolean;
    inputKind: 'text' | 'textarea' | 'tel' | 'email';
    maxLength: number;
}
export interface RegistrationSummary {
    id: number;
    status: RegistrationStatus;
    readiness: Readiness;
    createdAt: string;
    updatedAt: string;
    orgName: string | null;
    kktModel: string | null;
}
export interface RegistrationRequirement {
    id: number;
    kind: RequirementKind;
    status: RequirementStatus;
    value: string | null;
    source: string | null;
    version: number;
    requestedAt: string | null;
    providedAt: string | null;
    verifiedAt: string | null;
    canProvideValue: boolean;
    canUploadEvidence: boolean;
    blockedReason: string | null;
}
export interface RegistrationEvidence {
    id: number;
    requirementId: number | null;
    fileName: string;
    mimeType: string;
    sizeBytes: string;
    createdAt: string;
    available: boolean;
    downloadUrl: string;
}
export interface RegistrationDataRequest {
    id: number;
    requirementId: number;
    requestText: string;
    status: 'open' | 'delivered' | 'answered' | 'closed';
    createdAt: string;
    deliveredAt: string | null;
    answeredAt: string | null;
    closedAt: string | null;
}
export interface RegistrationDetail {
    registration: RegistrationSummary & {
        currentStep: number;
        handedOffAt: string | null;
        ofdProvisionMode: string;
    };
    application: Record<string, string>;
    form: { available: boolean; fields: RegistrationField[] };
    checklistAvailable: boolean;
    customerWorkflow: {
        canEditDraft: boolean;
        canSubmitDraft: boolean;
        expectedUpdatedAt: string;
        blockedReason: string | null;
    };
    requirements: RegistrationRequirement[];
    evidence: RegistrationEvidence[];
    dataRequests: RegistrationDataRequest[];
}
export interface RegistrationList {
    limit: number;
    items: Array<
        RegistrationSummary & {
            canResumeDraft: boolean;
            needsCustomerAction: boolean;
        }
    >;
}
