import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import {
    beginNewSession,
    checkSession,
    isSessionError,
    ServiceApiError,
    serviceApi,
} from './api';
import { FieldErrorSummary, ServiceFormRenderer } from './ServiceFormRenderer';
import { formErrors } from './form';
import type { Answers, ServiceType } from './types';
import { Loading, ServiceError, SessionNote } from './ui';
import { useMounted } from './useServiceRead';
export function ServiceRequestStartPage() {
    const [query] = useSearchParams();
    const navigate = useNavigate();
    const mounted = useMounted();
    const [types, setTypes] = useState<ServiceType[]>();
    const [missingSession, setMissingSession] = useState(false);
    const [code, setCode] = useState(query.get('type')?.slice(0, 80) ?? '');
    const [answers, setAnswers] = useState<Answers>({});
    const [error, setError] = useState<unknown>();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [existing, setExisting] = useState<number>();
    const context = ['product', 'solution', 'package']
        .flatMap((key) =>
            query.get(key) ? [query.get(key)!.slice(0, 200)] : [],
        )
        .join(' · ');
    useEffect(() => {
        const controller = new AbortController();
        void checkSession(controller.signal, false)
            .then(() => serviceApi.types(controller.signal))
            .then((items) => {
                if (!controller.signal.aborted) setTypes(items);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) {
                    if (isSessionError(failure)) setMissingSession(true);
                    else setError(failure);
                }
            });
        return () => controller.abort();
    }, []);
    const selected = types?.find((item) => item.code === code);
    const form = selected?.formVersion;
    const contactForm = form
        ? {
              ...form,
              schema: {
                  ...form.schema,
                  fields: form.schema.fields.filter((field) =>
                      ['contactName', 'phone'].includes(field.key),
                  ),
              },
          }
        : null;
    const start = async () => {
        if (busy) return;
        setBusy(true);
        setError(undefined);
        try {
            await beginNewSession();
            setTypes(await serviceApi.types());
            setMissingSession(false);
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    const create = async () => {
        if (busy || !form?.supported || !contactForm) return;
        const problems = formErrors(contactForm, answers, true);
        setErrors(problems);
        if (Object.keys(problems).length) {
            document
                .getElementById(`service-field-${Object.keys(problems)[0]}`)
                ?.focus();
            return;
        }
        setBusy(true);
        setError(undefined);
        try {
            const initial = { ...answers };
            if (
                context &&
                form.schema.fields.some((field) => field.key === 'description')
            )
                initial.description = context;
            const result = await serviceApi.create(
                code,
                String(answers.contactName ?? ''),
                String(answers.phone ?? ''),
                initial,
            );
            if (!mounted.current) return;
            if (result.created === false) setExisting(result.id);
            else void navigate(`/service/requests/${result.id}/edit`);
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="svc-section svc-narrow">
            <div className="svc-page-heading">
                <span className="ref-eyebrow">Новое обращение</span>
                <h1>Чем помочь?</h1>
                <p>Выберите услугу и контакт для связи.</p>
            </div>
            <SessionNote />
            {error != null && <ServiceError error={error} />}
            {missingSession ? (
                <div className="svc-section">
                    <p>
                        В этом браузере нет активной сессии. Можно начать новое
                        обращение. Это не восстановит доступ к прежним заявкам.
                    </p>
                    <button
                        className="ref-button ref-button--primary"
                        disabled={busy}
                        onClick={() => void start()}
                    >
                        <Plus size={18} />
                        Начать новое обращение
                    </button>
                </div>
            ) : !types ? (
                !error && <Loading />
            ) : existing ? (
                <div className="svc-section">
                    <h2>Найден незавершённый черновик</h2>
                    <p>Сохранённые ответы и файлы не изменены.</p>
                    <Link
                        className="ref-button ref-button--primary"
                        to={`/service/requests/${existing}/edit`}
                    >
                        Продолжить заполнение
                        <ArrowRight size={17} />
                    </Link>
                </div>
            ) : (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                    noValidate
                >
                    <div className="svc-field">
                        <label htmlFor="service-type">Услуга</label>
                        <select
                            id="service-type"
                            value={code}
                            disabled={busy}
                            onChange={(event) => {
                                setCode(event.target.value);
                                setAnswers({});
                                setErrors({});
                            }}
                        >
                            <option value="">Выберите услугу</option>
                            {types
                                .filter((item) => item.formVersion?.supported)
                                .map((item) => (
                                    <option value={item.code} key={item.code}>
                                        {item.title}
                                    </option>
                                ))}
                        </select>
                    </div>
                    {code && !form?.supported && (
                        <p className="svc-notice">
                            Эта услуга недоступна через общую форму.{' '}
                            <Link to="/contacts">Свяжитесь с сотрудником</Link>.
                        </p>
                    )}
                    {context && (
                        <p className="svc-caption">По поводу: {context}</p>
                    )}
                    {form?.supported && contactForm && (
                        <>
                            <p className="svc-caption">
                                {selected?.description}
                            </p>
                            <FieldErrorSummary errors={errors} />
                            <ServiceFormRenderer
                                form={contactForm}
                                answers={answers}
                                onChange={(key, value) =>
                                    setAnswers((old) => ({
                                        ...old,
                                        [key]: value,
                                    }))
                                }
                                errors={errors}
                                disabled={busy}
                            />
                        </>
                    )}
                    <div className="svc-actions">
                        <button
                            className="ref-button ref-button--primary"
                            disabled={
                                busy ||
                                !form?.supported ||
                                (error instanceof ServiceApiError &&
                                    error.uncertain)
                            }
                            type="submit"
                        >
                            {busy ? 'Создание…' : 'Создать черновик'}
                            <ArrowRight size={17} />
                        </button>
                        <Link className="ref-button" to="/service/requests">
                            Мои заявки
                        </Link>
                    </div>
                </form>
            )}
        </section>
    );
}
