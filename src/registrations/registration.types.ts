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
    | 'ofd';

export enum RegistrationType {
    REGISTRATION = 'REGISTRATION',
    FISCAL_REPLACEMENT = 'FISCAL_REPLACEMENT',
}