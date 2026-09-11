import type { RegistrationField } from './types';
export function registrationFormErrors(
    fields: RegistrationField[],
    values: Record<string, string>,
    submit: boolean,
) {
    const errors: Record<string, string> = {};
    for (const field of fields) {
        const value = values[field.name] ?? '';
        if (submit && field.required && !value.trim())
            errors[field.name] = 'Заполните это поле';
        else if (value.length > field.maxLength)
            errors[field.name] = `Не более ${field.maxLength} символов`;
    }
    return errors;
}
export function RegistrationFormRenderer({
    fields,
    values,
    onChange,
    errors,
    disabled,
}: {
    fields: RegistrationField[];
    values: Record<string, string>;
    onChange: (name: string, value: string) => void;
    errors: Record<string, string>;
    disabled: boolean;
}) {
    return (
        <div className="cr-form-grid">
            {fields.map((field) => {
                const id = `registration-field-${field.name}`;
                const props = {
                    id,
                    name: field.name,
                    value: values[field.name] ?? '',
                    disabled,
                    maxLength: field.maxLength,
                    required: field.required,
                    'aria-invalid': !!errors[field.name],
                    'aria-describedby': errors[field.name]
                        ? `${id}-error`
                        : undefined,
                    onChange: (
                        event: React.ChangeEvent<
                            HTMLInputElement | HTMLTextAreaElement
                        >,
                    ) => onChange(field.name, event.target.value),
                };
                return (
                    <div
                        className={`svc-field ${field.inputKind === 'textarea' ? 'cr-wide' : ''}`}
                        key={field.name}
                    >
                        <label htmlFor={id}>
                            {field.label}
                            {field.required && (
                                <span aria-hidden="true"> *</span>
                            )}
                        </label>
                        {field.inputKind === 'textarea' ? (
                            <textarea {...props} rows={3} />
                        ) : (
                            <input {...props} type={field.inputKind} />
                        )}
                        {errors[field.name] && (
                            <p id={`${id}-error`} className="cr-field-error">
                                {errors[field.name]}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
