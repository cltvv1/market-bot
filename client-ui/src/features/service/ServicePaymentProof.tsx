import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { ServiceApiError, serviceApi } from './api';
import { fileError } from './form';
import type { OwnerDetail } from './types';
import { dateText, DownloadButton, ServiceError } from './ui';
const policy = {
    maxBytes: 20 * 1024 * 1024,
    extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
};
export function ServicePaymentProof({
    detail,
    refresh,
}: {
    detail: OwnerDetail;
    refresh: () => Promise<OwnerDetail | undefined>;
}) {
    const [selection, setSelection] = useState<{
        file: File;
        version: number;
    }>();
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const [error, setError] = useState<unknown>();
    const [review, setReview] = useState(false);
    const [checked, setChecked] = useState(false);
    const [notice, setNotice] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const proof = detail.documents.paymentProof;
    const workflow = detail.customerWorkflow.paymentProof;
    const invalid = selection && fileError(selection.file, policy);
    const check = async () => {
        setChecked(false);
        const latest = await refresh();
        if (latest) setChecked(true);
    };
    const upload = async () => {
        if (!selection || invalid || review || lock.current) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        setNotice('');
        try {
            await serviceApi.upload(
                detail.request.id,
                'proof',
                selection.file,
                selection.version,
            );
            setSelection(undefined);
            if (input.current) input.current.value = '';
            setNotice(
                'Платёжный документ передан. Оплату подтвердит сотрудник после проверки.',
            );
            await refresh();
        } catch (failure) {
            setError(failure);
            if (
                failure instanceof ServiceApiError &&
                (failure.status === 409 || failure.uncertain)
            ) {
                setReview(true);
                await check();
            }
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <section
            className="svc-document-section"
            aria-labelledby="proof-heading"
        >
            <h2 id="proof-heading">Платёжное поручение</h2>
            <p className="svc-caption">
                Документ об оплате счёта. Проверка и подтверждение оплаты
                выполняются сотрудником.
            </p>
            {proof && (
                <div className="svc-document-row">
                    <div>
                        <strong>
                            {proof.originalName || 'Платёжный документ'}
                        </strong>
                        <p className="svc-caption">
                            {dateText(proof.createdAt)}
                            {detail.request.stage === 'waiting_payment'
                                ? ' · Передан на проверку'
                                : ''}
                        </p>
                    </div>
                    {proof.downloadable && proof.downloadUrl ? (
                        <DownloadButton
                            url={proof.downloadUrl}
                            name={proof.originalName || 'payment-proof'}
                        />
                    ) : (
                        <p className="svc-field-error">
                            Документ недоступен. Свяжитесь с сотрудником.
                        </p>
                    )}
                </div>
            )}
            {notice && (
                <p className="svc-notice" role="status">
                    {notice}
                </p>
            )}
            {error != null && <ServiceError error={error} />}
            {review && (
                <div className="svc-notice">
                    <p>
                        Сначала проверьте текущий документ и этап заявки. Имя
                        файла само по себе не подтверждает результат предыдущей
                        загрузки.
                    </p>
                    <div className="svc-actions">
                        <button
                            className="ref-button"
                            disabled={busy}
                            onClick={() => void check()}
                        >
                            Перечитать документ
                        </button>
                        <button
                            className="ref-button"
                            disabled={busy || !checked || !workflow.allowed}
                            onClick={() => {
                                setSelection((old) =>
                                    old
                                        ? {
                                              ...old,
                                              version:
                                                  detail.customerWorkflow
                                                      .expectedVersion,
                                          }
                                        : undefined,
                                );
                                setReview(false);
                                setError(undefined);
                            }}
                        >
                            Проверено: подготовить повторную загрузку
                        </button>
                    </div>
                </div>
            )}
            {workflow.allowed ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void upload();
                    }}
                >
                    <div className="svc-field">
                        <label htmlFor="payment-proof-file">
                            {workflow.replacement
                                ? 'Заменить платёжное поручение'
                                : 'Файл платёжного поручения'}
                        </label>
                        <input
                            id="payment-proof-file"
                            ref={input}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            disabled={busy}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                setSelection(
                                    file
                                        ? {
                                              file,
                                              version:
                                                  detail.customerWorkflow
                                                      .expectedVersion,
                                          }
                                        : undefined,
                                );
                                setReview(false);
                                setError(undefined);
                                setNotice('');
                            }}
                        />
                        <span className="svc-caption">
                            PDF, JPEG, PNG или WebP, до 20 МиБ.
                        </span>
                        {selection && (
                            <p className="svc-caption">
                                {selection.file.name} ·{' '}
                                {(selection.file.size / 1024).toFixed(1)} КиБ
                            </p>
                        )}
                        {invalid && (
                            <span className="svc-field-error" role="alert">
                                {invalid}
                            </span>
                        )}
                    </div>
                    {workflow.replacement && (
                        <p className="svc-caption">
                            Новый документ заменит текущий только после успешной
                            загрузки.
                        </p>
                    )}
                    <button
                        className="ref-button ref-button--primary"
                        disabled={
                            !selection || busy || review || Boolean(invalid)
                        }
                    >
                        <Upload size={17} />
                        {busy
                            ? 'Загрузка…'
                            : workflow.replacement
                              ? 'Заменить документ'
                              : 'Передать на проверку'}
                    </button>
                </form>
            ) : (
                <p className="svc-caption">{workflow.reason}</p>
            )}
        </section>
    );
}
