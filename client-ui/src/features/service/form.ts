import type { Answers, FormField, OwnerForm } from './types';
export const visibleField = (field: FormField, answers: Answers) =>
    !field.condition ||
    answers[field.condition.field] === field.condition.equals;
export function formErrors(
    form: OwnerForm,
    answers: Answers,
    complete: boolean,
) {
    const errors: Record<string, string> = {};
    for (const field of form.schema.fields) {
        if (
            !visibleField(field, answers) ||
            ['display', 'file_instruction'].includes(field.type)
        )
            continue;
        const value = answers[field.key];
        if (
            value == null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0)
        ) {
            if (complete && field.required)
                errors[field.key] = 'Заполните это поле.';
            continue;
        }
        if (
            field.key === 'consent' &&
            complete &&
            field.required &&
            value !== true
        )
            errors[field.key] = 'Необходимо ваше согласие.';
        if (
            typeof value === 'string' &&
            field.maxLength &&
            value.length > field.maxLength
        )
            errors[field.key] = `Не более ${field.maxLength} символов.`;
        if (
            field.type === 'phone' &&
            !/^\+?[0-9 ()-]{7,25}$/.test(String(value))
        )
            errors[field.key] = 'Проверьте номер телефона.';
        if (
            field.type === 'email' &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
        )
            errors[field.key] = 'Проверьте адрес электронной почты.';
        if (
            field.type === 'date' &&
            !Number.isFinite(Date.parse(String(value)))
        )
            errors[field.key] = 'Укажите дату.';
        if (
            field.type === 'number' &&
            (!Number.isFinite(Number(value)) ||
                (field.min != null && Number(value) < field.min) ||
                (field.max != null && Number(value) > field.max))
        )
            errors[field.key] = 'Число вне допустимого диапазона.';
        if (
            field.type === 'select' &&
            !field.options?.some((option) => option.value === value)
        )
            errors[field.key] = 'Выберите значение из списка.';
        if (
            field.type === 'multiselect' &&
            (!Array.isArray(value) ||
                value.some(
                    (item) =>
                        !field.options?.some((option) => option.value === item),
                ))
        )
            errors[field.key] = 'Выберите значения из списка.';
    }
    return errors;
}
export function editableAnswers(form: OwnerForm, answers: Answers): Answers {
    return Object.fromEntries(
        form.schema.fields
            .filter(
                (field) =>
                    !['display', 'file_instruction'].includes(field.type),
            )
            .map((field) => [
                field.key,
                visibleField(field, answers)
                    ? (answers[field.key] ?? null)
                    : null,
            ]),
    );
}
export function fileError(
    file: File,
    policy: { maxBytes: number; extensions: string[]; mimeTypes: string[] },
) {
    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (
        !extension ||
        !policy.extensions.some(
            (item) => (item.startsWith('.') ? item : `.${item}`) === extension,
        )
    )
        return 'Этот формат файла не поддерживается.';
    if (file.size > policy.maxBytes)
        return `Размер файла должен быть не больше ${Math.floor(policy.maxBytes / 1024 / 1024)} МиБ.`;
    if (file.size === 0) return 'Пустой файл нельзя отправить.';
    if (file.type && !policy.mimeTypes.includes(file.type))
        return 'Тип файла не поддерживается.';
    return null;
}
export function submitKey(id: number) {
    const storageKey = `vitma_service_submit_${id}`;
    try {
        const saved = sessionStorage.getItem(storageKey);
        if (
            saved &&
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(saved)
        )
            return saved;
    } catch {
        /* Storage is optional; the mounted editor still keeps its key. */
    }
    const key = crypto.randomUUID();
    try {
        sessionStorage.setItem(storageKey, key);
    } catch {
        /* Same-session memory fallback. */
    }
    return key;
}
