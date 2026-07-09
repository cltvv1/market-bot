import type { AtolConsentEntity } from './entities/atol-consent.entity';

export type AtolConsentField =
    | 'city'
    | 'clientName'
    | 'inn'
    | 'representativeName'
    | 'representativeBasis';

export interface AtolConsentStep {
    key: AtolConsentField;
    label: string;
}

export const atolConsentSteps: AtolConsentStep[] = [
    {
        key: 'city',
        label: 'Укажите город. Если город Красноярск, просто напишите: Красноярск',
    },
    {
        key: 'clientName',
        label: 'Укажите полное название организации или ИП, как в документах',
    },
    {
        key: 'inn',
        label: 'Укажите ИНН',
    },
    {
        key: 'representativeName',
        label: 'В лице кого составляется согласие? Например: Иванова Ивана Ивановича',
    },
    {
        key: 'representativeBasis',
        label: 'На основании чего действует представитель? Например: Устава, свидетельства ОГРНИП, доверенности',
    },
];

export function getAtolConsentStep(consent: AtolConsentEntity) {
    return atolConsentSteps[consent.currentStep] ?? null;
}
