export type ServiceFormFieldType =
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
    | 'file_instruction'
    | 'display';

export interface ServiceFormOption {
    value: string;
    label: string;
}

export interface ServiceFormCondition {
    field: string;
    equals: string | number | boolean;
}

export interface ServiceFormField {
    key: string;
    type: ServiceFormFieldType;
    label: string;
    required?: boolean;
    maxLength?: number;
    min?: number;
    max?: number;
    options?: ServiceFormOption[];
    condition?: ServiceFormCondition;
    customerVisible?: boolean;
}

export interface ServiceFormSchema {
    fields: ServiceFormField[];
    attachmentInstruction?: string;
    maxAttachments?: number;
}

export type ServiceRequestAnswers = Record<
    string,
    string | number | boolean | string[] | null
>;
