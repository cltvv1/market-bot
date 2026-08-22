export type RegistrationField =
    | 'orgName'
    | 'ogrn'
    | 'innKpp'
    | 'urAdress'
    | 'kktAdress'
    | 'kktName'
    | 'phone'
    | 'phoneToCall'
    | 'email'
    | 'nds'
    | 'excise'
    | 'markirovka'
    | 'services'
    | 'strictReporting'
    | 'taxSystem'
    | 'kktModel'
    | 'bankReqs'
    | 'ofd'
    | 'equipmentPhoto';

export enum RegistrationType {
    REGISTRATION = 'REGISTRATION',
    FISCAL_REPLACEMENT = 'FISCAL_REPLACEMENT',
}

export const REGISTRATION_REQUIREMENT_KINDS = [
    'kkt_serial',
    'fiscal_drive_serial',
    'ofd_code',
] as const;
export type RegistrationRequirementKind =
    (typeof REGISTRATION_REQUIREMENT_KINDS)[number];

export type RegistrationRequirementStatus =
    | 'missing'
    | 'requested'
    | 'provided'
    | 'verified'
    | 'not_required';

export type RegistrationDataSource =
    | 'internal_registry'
    | 'customer_input'
    | 'customer_photo'
    | 'sold_by_vitma'
    | 'operator_input'
    | 'external_system'
    | 'legacy';

export type OfdProvisionMode =
    | 'customer_has_code'
    | 'purchase_from_vitma'
    | 'clarification_required'
    | 'not_applicable';

export type RegistrationReadiness =
    | 'incomplete'
    | 'awaiting_customer'
    | 'awaiting_verification'
    | 'ready';
