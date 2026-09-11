import type { Priority } from '../../types';
export type RequirementKind = 'kkt_serial' | 'fiscal_drive_serial' | 'ofd_code';
export type ActionId =
    | 'operator-state'
    | 'provide-value'
    | 'verify'
    | 'request-data'
    | 're-request'
    | 'not-required'
    | 'ofd-mode'
    | 'equipment-kit'
    | 'link-evidence'
    | 'remove-evidence'
    | 'final-pdf'
    | 'handoff';
export type Identity = { id: number; displayName: string };
export type RegistrationStatus = 'draft' | 'new' | 'in_work' | 'processed';
export type Readiness =
    | 'incomplete'
    | 'awaiting_customer'
    | 'awaiting_verification'
    | 'ready';
export type OfdMode =
    | 'customer_has_code'
    | 'purchase_from_vitma'
    | 'clarification_required'
    | 'not_applicable';
export type Precondition = {
    expectedStatus: RegistrationStatus;
    expectedHandedOffAt: string | null;
    expectedRequirementVersion?: number;
    expectedRequirementVersions?: Partial<Record<RequirementKind, number>>;
    expectedPriority?: Priority;
    expectedOfdMode?: OfdMode;
    expectedKitId?: number | null;
    expectedEngineerId?: number | null;
    expectedPdfFileId?: number | null;
};
export type RegistrationAction = {
    id: ActionId;
    allowed: boolean;
    reason: string | null;
    reasonCode: string | null;
    inputFields: Array<{
        name: string;
        required: boolean;
        requiredWhen?: { field: string; equals: string };
    }>;
    precondition: Precondition;
};
export type RegistrationRow = {
    id: number;
    orgName: string | null;
    innKpp: string | null;
    kktModel: string | null;
    platform: string;
    status: RegistrationStatus;
    readiness: Readiness;
    priority: Priority;
    assignedEngineer: Identity | null;
    createdAt: string;
};
export type RegistrationPage = {
    items: RegistrationRow[];
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
};
export type RegistrationFile = {
    originalName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    downloadable: boolean;
    downloadUrl: string | null;
    unavailableReason: string | null;
};
export type Evidence = RegistrationFile & {
    id: number;
    requirementId: number | null;
    kind: string;
    createdAt: string;
};
export type Requirement = {
    id: number;
    kind: RequirementKind;
    status: 'missing' | 'requested' | 'provided' | 'verified' | 'not_required';
    value: string | null;
    hasValue: boolean;
    source: string | null;
    version: number;
    requestedAt: string | null;
    providedAt: string | null;
    verifiedAt: string | null;
    verifiedBy: Identity | null;
    notRequiredReason: string | null;
    operatorComment: string | null;
    actions: RegistrationAction[];
};
export type RegistrationDetailData = {
    registration: {
        id: number;
        platform: string;
        status: RegistrationStatus;
        readiness: Readiness;
        ofdProvisionMode: OfdMode;
        priority: Priority;
        equipmentKitId: number | null;
        assignedEngineer: Identity | null;
        handedOffAt: string | null;
        createdAt: string;
        updatedAt: string;
        application: Record<string, string | null>;
    };
    checklistAvailable: boolean;
    requirements: Requirement[];
    evidence: Evidence[];
    dataRequests: Array<{
        id: number;
        requirementId: number;
        requestText: string;
        status:
            | 'open'
            | 'delivered'
            | 'delivery_failed'
            | 'answered'
            | 'closed';
        targetChannel: string;
        createdAt: string;
        deliveredAt: string | null;
        answeredAt: string | null;
        closedAt: string | null;
        deliveryError: string | null;
    }>;
    pdf:
        | (RegistrationFile & { classification: 'draft' | 'final' | 'unknown' })
        | null;
    workflow: {
        primaryActionId: ActionId | null;
        actions: RegistrationAction[];
    };
    history: Array<{
        id: string;
        label: string;
        createdAt: string;
        actorType: string;
        result: string;
    }>;
    historyLimit: number;
};
export type RegistrationOptions = {
    kits: Array<{
        id: number;
        cashRegisterModel: string | null;
        cashRegisterSerial: string | null;
        fiscalDriveSerial: string | null;
    }>;
    engineers: Identity[];
    limit: number;
};
export type ActionSelection = {
    action: RegistrationAction;
    requirement?: Requirement;
    evidenceId?: number;
};
export const statusLabels = {
    draft: 'Черновик',
    new: 'Новая',
    in_work: 'В работе',
    processed: 'Обработана',
};
export const readinessLabels = {
    incomplete: 'Не хватает данных',
    awaiting_customer: 'Ждём данные клиента',
    awaiting_verification: 'Нужна проверка',
    ready: 'Данные проверены',
};
export const requirementLabels = {
    kkt_serial: 'Заводской номер ККТ',
    fiscal_drive_serial: 'Номер фискального накопителя',
    ofd_code: 'Код активации ОФД',
};
export const requirementStatusLabels = {
    missing: 'Не предоставлено',
    requested: 'Запрошено',
    provided: 'Получено, не проверено',
    verified: 'Проверено',
    not_required: 'Не требуется',
};
export const ofdLabels = {
    customer_has_code: 'Код у клиента',
    purchase_from_vitma: 'Код предоставляет ВИТМА',
    clarification_required: 'Нужно уточнить',
    not_applicable: 'Не применяется',
};
export const sourceLabels: Record<string, string> = {
    internal_registry: 'Реестр комплектов',
    customer_input: 'Ввод клиента',
    customer_photo: 'Фото / документ клиента',
    sold_by_vitma: 'Предоставлено ВИТМА',
    operator_input: 'Ввод сотрудника',
    external_system: 'Внешняя система',
};
export const actionLabels: Record<ActionId, string> = {
    'operator-state': 'Обработка и приоритет',
    'provide-value': 'Внести значение',
    verify: 'Подтвердить проверку',
    'request-data': 'Запросить у клиента',
    're-request': 'Повторно запросить',
    'not-required': 'Не требуется',
    'ofd-mode': 'Способ подключения ОФД',
    'equipment-kit': 'Привязать комплект',
    'link-evidence': 'Связать подтверждение',
    'remove-evidence': 'Удалить связь',
    'final-pdf': 'Подготовить финальный PDF',
    handoff: 'Передать инженеру',
};
