import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, RefreshCw, Save, Send } from 'lucide-react';
import { ServiceApiError, serviceApi } from './api';
import { editableAnswers, formErrors, submitKey } from './form';
import type { Answers, OwnerDetail, OwnerForm } from './types';
import { useMounted, useServiceRead } from './useServiceRead';
import { answerText, Loading, ServiceError } from './ui';
import { FieldErrorSummary, ServiceFormRenderer } from './ServiceFormRenderer';
import { ServiceDraftFiles, type QueuedFile } from './ServiceDraftFiles';

export function ServiceDraftPage() {
    const { id } = useParams();
    const view = useServiceRead(`draft-${id}`, (signal) =>
        serviceApi.detail(Number(id), signal),
    );
    if (!view.data)
        return (
            <>
                {view.error != null ? (
                    <ServiceError
                        error={view.error}
                        retry={() => void view.refresh()}
                    />
                ) : (
                    <Loading />
                )}
            </>
        );
    if (!view.data.request.isDraft)
        return (
            <Navigate
                replace
                to={`/service/requests/${view.data.request.id}`}
            />
        );
    if (
        !view.data.form?.supported ||
        !view.data.customerWorkflow.editDraft.allowed
    )
        return (
            <section className="svc-section">
                <h1>Черновик недоступен для редактирования</h1>
                <p>
                    Форма требует отдельного сценария.{' '}
                    <Link to="/contacts">Свяжитесь с сотрудником</Link>.
                </p>
                <Link className="ref-button" to="/service/requests">
                    Мои заявки
                </Link>
            </section>
        );
    return (
        <ServiceDraftEditor
            key={id}
            detail={view.data}
            form={view.data.form}
            refresh={view.refresh}
            readError={view.error}
        />
    );
}
function ServiceDraftEditor({
    detail,
    form,
    refresh,
    readError,
}: {
    detail: OwnerDetail;
    form: OwnerForm;
    refresh: () => Promise<OwnerDetail | undefined>;
    readError?: unknown;
}) {
    const navigate = useNavigate();
    const mounted = useMounted();
    const [answers, setAnswers] = useState<Answers>(detail.request.answers);
    const [baseline, setBaseline] = useState(detail.request.answers);
    const [version, setVersion] = useState(detail.request.version);
    const [queue, setQueue] = useState<QueuedFile[]>([]);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const [error, setError] = useState<unknown>();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [notice, setNotice] = useState('');
    const [needsReview, setNeedsReview] = useState(false);
    const key = useRef<string | undefined>(undefined);
    const id = detail.request.id;
    const dirty =
        JSON.stringify(editableAnswers(form, answers)) !==
        JSON.stringify(editableAnswers(form, baseline));
    const pendingFiles = queue.some((item) => item.status !== 'uploaded');
    const uploading = queue.some((item) => item.status === 'uploading');
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty || pendingFiles) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty, pendingFiles]);
    const validate = (complete: boolean) => {
        const found = formErrors(form, answers, complete);
        setErrors(found);
        if (Object.keys(found).length)
            document
                .getElementById(`service-field-${Object.keys(found)[0]}`)
                ?.focus();
        return Object.keys(found).length === 0;
    };
    const save = async () => {
        const saved = await serviceApi.save(
            id,
            version,
            editableAnswers(form, answers),
        );
        setVersion(saved.version);
        setBaseline(answers);
        setNotice('Сохранено');
        return saved.version;
    };
    const action = async (submit: boolean) => {
        if (
            lock.current ||
            needsReview ||
            uploading ||
            (submit && pendingFiles) ||
            !validate(submit)
        )
            return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        setNotice('');
        try {
            const currentVersion = await save();
            if (submit) {
                key.current ??= submitKey(id);
                await serviceApi.submit(id, currentVersion, key.current);
                if (mounted.current)
                    void navigate(`/service/requests/${id}`, { replace: true });
            } else await refresh();
        } catch (failure) {
            setError(failure);
            if (
                failure instanceof ServiceApiError &&
                (failure.status === 409 || failure.uncertain)
            ) {
                setNeedsReview(true);
                const latest = await refresh();
                if (mounted.current && latest && !latest.request.isDraft)
                    void navigate(`/service/requests/${id}`, { replace: true });
            }
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const compare = needsReview || detail.request.version !== version;
    return (
        <section className="svc-section">
            <Link className="svc-back" to="/service/requests">
                <ArrowLeft size={17} />
                Мои заявки
            </Link>
            <div className="svc-page-heading">
                <span className="ref-eyebrow">
                    Черновик · {detail.request.requestNumber}
                </span>
                <h1>{detail.request.serviceTypeTitle}</h1>
                <p>Заполните данные и отправьте заявку сотруднику.</p>
            </div>
            {(detail.request.linkedOrganization ||
                detail.request.linkedEquipment) && (
                <p className="svc-notice">
                    Привязка организации и оборудования сохранена. Эта форма не
                    меняет права представителя и принадлежность оборудования.
                </p>
            )}
            {error != null && <ServiceError error={error} />}
            {readError != null && (
                <ServiceError error={readError} retry={() => void refresh()} />
            )}
            {compare && (
                <section className="svc-notice svc-conflict">
                    <h2>Проверьте актуальную заявку</h2>
                    <p>
                        Локальные ответы сохранены на экране, но ещё не
                        применены к новой версии.
                    </p>
                    <dl className="svc-facts">
                        {form.schema.fields
                            .filter(
                                (field) =>
                                    answerText(answers[field.key]) !==
                                    answerText(
                                        detail.request.answers[field.key],
                                    ),
                            )
                            .map((field) => (
                                <div key={field.key}>
                                    <dt>{field.label}</dt>
                                    <dd>
                                        Сервер:{' '}
                                        {answerText(
                                            detail.request.answers[field.key],
                                        )}
                                    </dd>
                                    <dd>
                                        Ваш ввод:{' '}
                                        {answerText(answers[field.key])}
                                    </dd>
                                </div>
                            ))}
                    </dl>
                    <div className="svc-actions">
                        <button
                            className="ref-button"
                            disabled={busy}
                            onClick={() => void refresh()}
                        >
                            <RefreshCw size={16} />
                            Перечитать заявку
                        </button>
                        <button
                            className="ref-button"
                            disabled={busy || readError != null}
                            onClick={() => {
                                setAnswers(detail.request.answers);
                                setBaseline(detail.request.answers);
                                setVersion(detail.request.version);
                                setNeedsReview(false);
                                setError(undefined);
                            }}
                        >
                            Использовать данные сервера
                        </button>
                        <button
                            className="ref-button"
                            disabled={busy || readError != null}
                            onClick={() => {
                                setVersion(detail.request.version);
                                setBaseline(detail.request.answers);
                                setNeedsReview(false);
                                setError(undefined);
                                setNotice(
                                    'Ваш ввод оставлен. Сохраните его отдельно, чтобы применить к актуальной версии.',
                                );
                            }}
                        >
                            Оставить мой ввод для сохранения
                        </button>
                    </div>
                </section>
            )}
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void action(false);
                }}
                className="svc-editor"
            >
                <FieldErrorSummary errors={errors} />
                <ServiceFormRenderer
                    form={form}
                    answers={answers}
                    onChange={(field, value) => {
                        setAnswers((old) => ({ ...old, [field]: value }));
                        setNotice('');
                    }}
                    errors={errors}
                    disabled={busy}
                />
                <div className="svc-actions">
                    <button
                        className="ref-button"
                        disabled={busy || uploading || needsReview}
                        type="submit"
                    >
                        <Save size={17} />
                        Сохранить черновик
                    </button>
                    <span className="svc-caption" role="status">
                        {notice ||
                            (dirty
                                ? 'Есть несохранённые изменения'
                                : 'Данные сохранены')}
                    </span>
                </div>
            </form>
            <ServiceDraftFiles
                detail={detail}
                queue={queue}
                setQueue={setQueue}
                disabled={busy || uploading}
                refresh={refresh}
            />
            <div className="svc-submit">
                <div>
                    <h2>Передать сотруднику</h2>
                    <p>
                        {pendingFiles
                            ? 'Сначала загрузите выбранные файлы или уберите их из выбора.'
                            : 'После отправки дополнительные сведения можно написать в переписке.'}
                    </p>
                </div>
                <button
                    className="ref-button ref-button--primary"
                    disabled={
                        busy ||
                        pendingFiles ||
                        needsReview ||
                        !detail.customerWorkflow.submitDraft.allowed
                    }
                    onClick={() => void action(true)}
                >
                    {busy ? <Check size={18} /> : <Send size={18} />}Отправить
                    заявку
                </button>
            </div>
        </section>
    );
}
