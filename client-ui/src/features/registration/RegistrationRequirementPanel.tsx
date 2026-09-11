import { useRef, useState } from 'react';
import { Check, Send, Upload } from 'lucide-react';
import { ClientApiError } from '../../api/client-session';
import { registrationApi } from './api';
import type {
    RegistrationDataRequest,
    RegistrationDetail,
    RegistrationEvidence,
    RegistrationRequirement,
} from './types';
import {
    dateText,
    RegistrationError,
    requirementLabel,
    requirementStatus,
} from './ui';
import { RegistrationEvidenceList } from './RegistrationEvidenceList';

export function registrationEvidenceError(
    file: Pick<File, 'name' | 'size' | 'type'>,
) {
    const types: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
    };
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!file.size || file.size > 15 * 1024 * 1024)
        return 'Файл должен быть непустым и не больше 15 МБ.';
    if (!types[extension] || (file.type && file.type !== types[extension]))
        return 'Подойдёт PDF, JPEG, PNG или WebP.';
    return null;
}
export function RegistrationRequirementPanel({
    id,
    item,
    evidence,
    requests,
    refresh,
}: {
    id: number;
    item: RegistrationRequirement;
    evidence: RegistrationEvidence[];
    requests: RegistrationDataRequest[];
    refresh: () => Promise<RegistrationDetail | undefined>;
}) {
    const [value, setValue] = useState('');
    const [file, setFile] = useState<File>();
    const [version, setVersion] = useState<number>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const [notice, setNotice] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [rechecked, setRechecked] = useState(false);
    const [fileError, setFileError] = useState('');
    const active = useRef(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const stale = version !== undefined && version !== item.version;
    const readonly = !item.canProvideValue && !item.canUploadEvidence;
    const pending = requests.find(
        (request) =>
            request.status === 'open' || request.status === 'delivered',
    );
    const readCurrent = async () => {
        const current = await refresh();
        setRechecked(Boolean(current));
    };
    const submit = async (kind: 'value' | 'file') => {
        if (active.current || stale || uncertain) return;
        if (kind === 'file' && (!file || registrationEvidenceError(file))) {
            setFileError(
                file ? registrationEvidenceError(file)! : 'Выберите файл',
            );
            return;
        }
        active.current = true;
        setBusy(true);
        setError(undefined);
        setNotice('');
        const expected = version ?? item.version;
        try {
            const result =
                kind === 'value'
                    ? await registrationApi.value(
                          id,
                          item.kind,
                          value,
                          expected,
                      )
                    : await registrationApi.evidence(
                          id,
                          item.kind,
                          file!,
                          expected,
                      );
            if (kind === 'value') setValue('');
            else {
                setFile(undefined);
                if (fileInput.current) fileInput.current.value = '';
            }
            setVersion(
                result.requirements.find(
                    (requirement) => requirement.id === item.id,
                )?.version,
            );
            setNotice('Ответ сохранён. Сотрудник проверит данные.');
            await refresh();
        } catch (failure) {
            setError(failure);
            if (
                failure instanceof ClientApiError &&
                (failure.status === 409 || failure.uncertain)
            ) {
                setUncertain(true);
                setRechecked(false);
                await readCurrent();
            }
        } finally {
            active.current = false;
            setBusy(false);
        }
    };
    return (
        <article
            className="cr-requirement"
            aria-label={requirementLabel[item.kind]}
        >
            <header className="svc-heading-row">
                <h3>{requirementLabel[item.kind]}</h3>
                <span className="svc-stage">
                    {item.status === 'verified' && (
                        <Check size={15} aria-hidden="true" />
                    )}
                    {requirementStatus[item.status]}
                </span>
            </header>
            {pending && (
                <div className="cr-request">
                    <strong>Запрос сотрудника</strong>
                    <p>{pending.requestText}</p>
                    <span className="svc-caption">
                        {dateText(pending.createdAt)}
                    </span>
                </div>
            )}
            {item.value && <p className="cr-value">{item.value}</p>}
            {item.kind === 'ofd_code' && item.value && (
                <p className="svc-caption">Сохранённый код скрыт.</p>
            )}
            {evidence.length > 0 && (
                <RegistrationEvidenceList items={evidence} />
            )}
            {error != null && !readonly && (
                <RegistrationError
                    error={error}
                    retry={() => void readCurrent()}
                />
            )}
            {(stale || uncertain) && !readonly && (
                <div className="svc-notice cr-conflict">
                    <p>
                        Данные могли измениться. Ваш текст и выбранный файл
                        сохранены на странице. Проверьте текущий статус и список
                        приложений перед повторной отправкой.
                    </p>
                    {uncertain && !rechecked && (
                        <button
                            className="ref-button"
                            disabled={busy}
                            onClick={() => void readCurrent()}
                        >
                            Проверить текущие данные
                        </button>
                    )}
                    <button
                        className="ref-button"
                        disabled={busy || (uncertain && !rechecked)}
                        onClick={() => {
                            setVersion(item.version);
                            setUncertain(false);
                            setError(undefined);
                        }}
                    >
                        Проверено, разрешить повторную отправку
                    </button>
                </div>
            )}
            {readonly ? (
                <p className="svc-caption">
                    {['verified', 'not_required'].includes(item.status)
                        ? 'Дополнительный ответ не требуется.'
                        : 'Сейчас приём ответов недоступен.'}
                </p>
            ) : (
                <div className="cr-response">
                    {item.canProvideValue && (
                        <form
                            noValidate
                            onSubmit={(event) => {
                                event.preventDefault();
                                void submit('value');
                            }}
                        >
                            <div className="svc-field">
                                <label htmlFor={`requirement-value-${item.id}`}>
                                    {item.kind === 'ofd_code'
                                        ? 'Передать код ОФД'
                                        : 'Передать номер'}
                                </label>
                                <input
                                    id={`requirement-value-${item.id}`}
                                    autoComplete="off"
                                    maxLength={500}
                                    value={value}
                                    disabled={busy}
                                    onChange={(event) => {
                                        setVersion(
                                            (old) => old ?? item.version,
                                        );
                                        setValue(event.target.value);
                                        setNotice('');
                                    }}
                                />
                            </div>
                            <button
                                className="ref-button"
                                disabled={
                                    busy || stale || uncertain || !value.trim()
                                }
                            >
                                <Send size={16} />
                                Отправить данные
                            </button>
                        </form>
                    )}
                    {item.canUploadEvidence && (
                        <div>
                            <div className="svc-field">
                                <label htmlFor={`requirement-file-${item.id}`}>
                                    Подтверждение: фото или документ
                                </label>
                                <input
                                    ref={fileInput}
                                    id={`requirement-file-${item.id}`}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    disabled={busy}
                                    onChange={(event) => {
                                        const selected =
                                            event.target.files?.[0];
                                        setFile(selected);
                                        setVersion(
                                            (old) => old ?? item.version,
                                        );
                                        setFileError(
                                            selected
                                                ? (registrationEvidenceError(
                                                      selected,
                                                  ) ?? '')
                                                : '',
                                        );
                                        setNotice('');
                                    }}
                                />
                                <span className="svc-caption">
                                    PDF, JPEG, PNG или WebP, до 15 МБ
                                </span>
                                {fileError && (
                                    <p className="cr-field-error" role="alert">
                                        {fileError}
                                    </p>
                                )}
                            </div>
                            <button
                                className="ref-button"
                                disabled={
                                    busy ||
                                    stale ||
                                    uncertain ||
                                    !file ||
                                    !!fileError
                                }
                                onClick={() => void submit('file')}
                            >
                                <Upload size={16} />
                                {busy ? 'Передаём...' : 'Передать файл'}
                            </button>
                        </div>
                    )}
                </div>
            )}
            {notice && <p role="status">{notice}</p>}
        </article>
    );
}
