import { useEffect, useRef, useState } from 'react';
import { Check, Save, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClientApiError } from '../../api/client-session';
import { registrationApi, registrationId } from './api';
import type { RegistrationDetail } from './types';
import { useRegistrationRead } from './useRegistrationRead';
import {
    dateText,
    RegistrationBack,
    RegistrationError,
    RegistrationLoading,
    RegistrationSessionNote,
} from './ui';
import {
    RegistrationFormRenderer,
    registrationFormErrors,
} from './RegistrationFormRenderer';

export function RegistrationDraftPage() {
    const { id } = useParams();
    const { data, error, refresh } = useRegistrationRead(
        `registration-edit-${id}`,
        (signal) => registrationApi.detail(registrationId(id), signal),
    );
    return (
        <section className="svc-section client-reg">
            <RegistrationBack />
            {error != null && (
                <RegistrationError error={error} retry={() => void refresh()} />
            )}
            {!data && error == null && <RegistrationLoading />}
            {data && <RegistrationDraftEditor key={id} initial={data} />}
        </section>
    );
}
function RegistrationDraftEditor({ initial }: { initial: RegistrationDetail }) {
    const [data, setData] = useState(initial);
    const [values, setValues] = useState(initial.application);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<unknown>();
    const [conflict, setConflict] = useState<RegistrationDetail>();
    const [busy, setBusy] = useState(false);
    const [review, setReview] = useState(false);
    const [notice, setNotice] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const guard = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const navigate = useNavigate();
    const id = data.registration.id;
    const dirty = data.form.fields.some(
        (field) =>
            (values[field.name] ?? '') !== (data.application[field.name] ?? ''),
    );
    const readCurrent = async () => {
        try {
            const current = await registrationApi.detail(id);
            if (!mounted.current) return;
            if (current.registration.status !== 'draft') {
                void navigate(`/registrations/${id}`, { replace: true });
                return;
            }
            setConflict(current);
            setUncertain(false);
        } catch (failure) {
            if (mounted.current) setError(failure);
        }
    };
    const run = async (submit: boolean) => {
        if (guard.current || uncertain || conflict) return;
        const validation = registrationFormErrors(
            data.form.fields,
            values,
            submit,
        );
        setErrors(validation);
        const first = Object.keys(validation)[0];
        if (first) {
            setReview(false);
            requestAnimationFrame(() =>
                document.getElementById(`registration-field-${first}`)?.focus(),
            );
            return;
        }
        guard.current = true;
        setBusy(true);
        setError(undefined);
        setNotice('');
        try {
            const result = submit
                ? await registrationApi.submit(
                      id,
                      data.customerWorkflow.expectedUpdatedAt,
                  )
                : await registrationApi.save(
                      id,
                      data.customerWorkflow.expectedUpdatedAt,
                      Object.fromEntries(
                          data.form.fields.map((field) => [
                              field.name,
                              values[field.name] ?? '',
                          ]),
                      ),
                  );
            if (!mounted.current) return;
            if (submit) {
                void navigate(`/registrations/${id}`, { replace: true });
                return;
            }
            setData(result);
            setValues(result.application);
            setConflict(undefined);
            setNotice('Черновик сохранён');
        } catch (failure) {
            if (!mounted.current) return;
            setError(failure);
            if (
                failure instanceof ClientApiError &&
                (failure.status === 409 || failure.uncertain)
            ) {
                setUncertain(true);
                await readCurrent();
            }
        } finally {
            if (mounted.current) setBusy(false);
            guard.current = false;
        }
    };
    const prepare = () => {
        const validation = registrationFormErrors(
            data.form.fields,
            values,
            true,
        );
        setErrors(validation);
        const first = Object.keys(validation)[0];
        if (first) {
            requestAnimationFrame(() =>
                document.getElementById(`registration-field-${first}`)?.focus(),
            );
            return;
        }
        setReview(true);
    };
    if (!data.customerWorkflow.canEditDraft)
        return (
            <div className="svc-empty">
                <h1>Анкета #{id}</h1>
                <p>Редактирование анкеты недоступно.</p>
                <Link className="ref-button" to={`/registrations/${id}`}>
                    Открыть анкету
                </Link>
            </div>
        );
    return (
        <>
            <header className="svc-page-heading">
                <span className="ref-eyebrow">Анкета #{id} · Черновик</span>
                <h1>Регистрация кассы</h1>
                <p>Сохранено: {dateText(data.registration.updatedAt)}</p>
            </header>
            <RegistrationSessionNote />
            {error != null && (
                <RegistrationError
                    error={error}
                    retry={() => void readCurrent()}
                />
            )}
            {conflict && (
                <section
                    className="svc-notice cr-conflict"
                    aria-label="Сравнение с сохранённой анкетой"
                >
                    <h2>Сверьте сохранённые данные</h2>
                    <p>
                        Ваш ввод остался на странице. Перед повторной отправкой
                        сравните его с текущей анкетой.
                    </p>
                    <dl>
                        {conflict.form.fields
                            .filter(
                                (field) =>
                                    (values[field.name] ?? '') !==
                                    (conflict.application[field.name] ?? ''),
                            )
                            .map((field) => (
                                <div key={field.name}>
                                    <dt>{field.label}</dt>
                                    <dd>
                                        На сервере:{' '}
                                        {conflict.application[field.name] ||
                                            'Не заполнено'}
                                    </dd>
                                    <dd>
                                        Ваш ввод:{' '}
                                        {values[field.name] || 'Не заполнено'}
                                    </dd>
                                </div>
                            ))}
                    </dl>
                    <button
                        className="ref-button"
                        onClick={() => {
                            setData(conflict);
                            setConflict(undefined);
                            setError(undefined);
                            setReview(false);
                        }}
                    >
                        Сверено, оставить мой ввод
                    </button>
                    <button
                        className="ref-button"
                        onClick={() => {
                            setData(conflict);
                            setValues(conflict.application);
                            setConflict(undefined);
                            setError(undefined);
                            setReview(false);
                        }}
                    >
                        Загрузить сохранённые значения
                    </button>
                </section>
            )}
            {review ? (
                <section className="cr-review">
                    <h2>Проверьте анкету перед отправкой</h2>
                    <dl className="cr-application">
                        {data.form.fields.map((field) => (
                            <div key={field.name}>
                                <dt>{field.label}</dt>
                                <dd>
                                    {data.application[field.name] ||
                                        'Не заполнено'}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <p>
                        После отправки сотрудник проверит реквизиты. Номера
                        оборудования и подтверждения можно будет дослать в
                        анкете.
                    </p>
                    <div className="svc-actions">
                        <button
                            className="ref-button"
                            disabled={busy}
                            onClick={() => setReview(false)}
                        >
                            Вернуться к заполнению
                        </button>
                        <button
                            className="ref-button ref-button--primary"
                            disabled={busy || uncertain || !!conflict || dirty}
                            onClick={() => void run(true)}
                        >
                            <Send size={17} />
                            {busy ? 'Отправляем...' : 'Отправить анкету'}
                        </button>
                    </div>
                </section>
            ) : (
                <form
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        void run(false);
                    }}
                >
                    <RegistrationFormRenderer
                        fields={data.form.fields}
                        values={values}
                        errors={errors}
                        disabled={busy}
                        onChange={(name, value) => {
                            setValues((old) => ({ ...old, [name]: value }));
                            setNotice('');
                        }}
                    />
                    <div className="cr-editor-actions">
                        <div role="status">
                            {notice ? (
                                <>
                                    <Check size={17} />
                                    {notice}
                                </>
                            ) : dirty ? (
                                'Есть несохранённые изменения'
                            ) : (
                                'Все изменения сохранены'
                            )}
                        </div>
                        <div className="svc-actions">
                            <button
                                type="submit"
                                className="ref-button"
                                disabled={busy || uncertain || !!conflict}
                            >
                                <Save size={17} />
                                {busy ? 'Сохраняем...' : 'Сохранить черновик'}
                            </button>
                            <button
                                type="button"
                                className="ref-button ref-button--primary"
                                disabled={
                                    busy ||
                                    uncertain ||
                                    dirty ||
                                    !!conflict ||
                                    !data.customerWorkflow.canSubmitDraft
                                }
                                onClick={prepare}
                            >
                                <Send size={17} />
                                Проверить и отправить
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </>
    );
}
