export const INTEGRATION_PROVIDERS = ['atol_connect', 'platforma_ofd'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationRunStatus =
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed';
export type IntegrationRunMode = 'shadow' | 'apply';
export type ExternalEntityType =
    | 'organization'
    | 'cash_register'
    | 'fiscal_drive'
    | 'ofd_subscription'
    | 'contact';

export type ObservationSeverity = 'info' | 'low' | 'normal' | 'high' | 'urgent';
export type ObservationStatus = 'active' | 'resolved';
export type OpportunityStatus =
    | 'new'
    | 'in_progress'
    | 'contact_later'
    | 'converted'
    | 'resolved'
    | 'not_relevant';
