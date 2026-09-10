import { Link } from 'react-router-dom';
import type { Answer, Answers, OwnerForm } from './types';
import { visibleField } from './form';
export function ServiceFormRenderer({
    form,
    answers,
    onChange,
    errors = {},
    disabled = false,
}: {
    form: OwnerForm;
    answers: Answers;
    onChange: (key: string, value: Answer) => void;
    errors?: Record<string, string>;
    disabled?: boolean;
}) {
    return (
        <div className="svc-form-grid">
            {form.schema.fields
                .filter((field) => visibleField(field, answers))
                .map((field) => {
                    const id = `service-field-${field.key}`;
                    const error = errors[field.key];
                    const value = answers[field.key];
                    if (['display', 'file_instruction'].includes(field.type))
                        return (
                            <p
                                className="svc-field svc-field-wide svc-caption"
                                key={field.key}
                            >
                                {field.label}
                            </p>
                        );
                    const shared = {
                        id,
                        disabled,
                        'aria-invalid': Boolean(error),
                        'aria-describedby': error ? `${id}-error` : undefined,
                    };
                    const label = (
                        <label htmlFor={id}>
                            {field.label}
                            {field.required && (
                                <span aria-label="обязательное поле"> *</span>
                            )}
                        </label>
                    );
                    let control;
                    if (field.type === 'boolean')
                        control = (
                            <div className="svc-checkbox">
                                <input
                                    {...shared}
                                    type="checkbox"
                                    checked={value === true}
                                    onChange={(event) =>
                                        onChange(
                                            field.key,
                                            event.target.checked,
                                        )
                                    }
                                />
                                {label}
                                {field.key === 'consent' && (
                                    <Link
                                        to="/privacy"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Условия
                                    </Link>
                                )}
                            </div>
                        );
                    else if (field.type === 'select')
                        control = (
                            <>
                                {label}
                                <select
                                    {...shared}
                                    value={
                                        typeof value === 'string' ? value : ''
                                    }
                                    onChange={(event) =>
                                        onChange(field.key, event.target.value)
                                    }
                                >
                                    <option value="">Выберите</option>
                                    {field.options?.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </>
                        );
                    else if (field.type === 'multiselect')
                        control = (
                            <fieldset
                                disabled={disabled}
                                aria-describedby={shared['aria-describedby']}
                                aria-invalid={Boolean(error)}
                            >
                                <legend>
                                    {field.label}
                                    {field.required ? ' *' : ''}
                                </legend>
                                {field.options?.map((option, index) => (
                                    <label
                                        className="svc-checkbox"
                                        key={option.value}
                                    >
                                        <input
                                            id={index === 0 ? id : undefined}
                                            type="checkbox"
                                            checked={
                                                Array.isArray(value) &&
                                                value.includes(option.value)
                                            }
                                            onChange={(event) =>
                                                onChange(
                                                    field.key,
                                                    event.target.checked
                                                        ? [
                                                              ...(Array.isArray(
                                                                  value,
                                                              )
                                                                  ? value
                                                                  : []),
                                                              option.value,
                                                          ]
                                                        : (Array.isArray(value)
                                                              ? value
                                                              : []
                                                          ).filter(
                                                              (item) =>
                                                                  item !==
                                                                  option.value,
                                                          ),
                                                )
                                            }
                                        />
                                        {option.label}
                                    </label>
                                ))}
                            </fieldset>
                        );
                    else if (['textarea', 'address'].includes(field.type))
                        control = (
                            <>
                                {label}
                                <textarea
                                    {...shared}
                                    rows={field.type === 'address' ? 2 : 4}
                                    maxLength={field.maxLength}
                                    value={
                                        typeof value === 'string' ? value : ''
                                    }
                                    onChange={(event) =>
                                        onChange(field.key, event.target.value)
                                    }
                                />
                            </>
                        );
                    else
                        control = (
                            <>
                                {label}
                                <input
                                    {...shared}
                                    type={
                                        field.type === 'number'
                                            ? 'number'
                                            : field.type === 'phone'
                                              ? 'tel'
                                              : ['email', 'date'].includes(
                                                      field.type,
                                                  )
                                                ? field.type
                                                : 'text'
                                    }
                                    min={field.min}
                                    max={field.max}
                                    step={
                                        field.type === 'number'
                                            ? 'any'
                                            : undefined
                                    }
                                    maxLength={field.maxLength}
                                    autoComplete={
                                        field.type === 'phone'
                                            ? 'tel'
                                            : field.type === 'email'
                                              ? 'email'
                                              : undefined
                                    }
                                    value={
                                        typeof value === 'string' ||
                                        typeof value === 'number'
                                            ? value
                                            : ''
                                    }
                                    onChange={(event) =>
                                        onChange(
                                            field.key,
                                            field.type === 'number' &&
                                                event.target.value !== ''
                                                ? Number(event.target.value)
                                                : event.target.value,
                                        )
                                    }
                                />
                            </>
                        );
                    return (
                        <div
                            key={field.key}
                            className={`svc-field ${['textarea', 'address', 'boolean', 'multiselect'].includes(field.type) ? 'svc-field-wide' : ''}`}
                        >
                            {control}
                            {error && (
                                <span
                                    id={`${id}-error`}
                                    className="svc-field-error"
                                >
                                    {error}
                                </span>
                            )}
                        </div>
                    );
                })}
        </div>
    );
}
export function FieldErrorSummary({
    errors,
}: {
    errors: Record<string, string>;
}) {
    const keys = Object.keys(errors);
    return keys.length ? (
        <div className="svc-notice svc-error" role="alert">
            <p>Проверьте отмеченные поля.</p>
            <button
                className="ref-button"
                type="button"
                onClick={() =>
                    document.getElementById(`service-field-${keys[0]}`)?.focus()
                }
            >
                К первому полю
            </button>
        </div>
    ) : null;
}
