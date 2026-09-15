import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../../components/ui';
import { ClientApiError, storeApi, storeError } from '../api';
import type { OrderDetail } from '../types';
export function paymentProofError(file: Pick<File, 'name' | 'size' | 'type'>) {
    const expected: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
    };
    const mime = expected[file.name.split('.').pop()?.toLowerCase() ?? ''];
    return !file.size ||
        file.size > 20 * 1024 * 1024 ||
        !mime ||
        (file.type && file.type !== mime)
        ? 'Выберите PDF, JPEG, PNG или WebP размером до 20 МиБ.'
        : null;
}
export function OrderPaymentProof({
    order,
    refresh,
    saved,
    blocked,
}: {
    order: OrderDetail;
    refresh: () => Promise<OrderDetail | null>;
    saved: (order: OrderDetail) => void;
    blocked: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [checked, setChecked] = useState(false);
    const [received, setReceived] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const submitting = useRef(false);
    const fingerprint = useRef('');
    const priorIds = useRef<number[]>([]);
    async function reconcile() {
        setChecked(false);
        const current = await refresh();
        if (!current) return;
        setChecked(true);
        const found = current.documents.paymentProofs.some(
            (proof) =>
                !priorIds.current.includes(proof.id) &&
                proof.sha256 === fingerprint.current,
        );
        if (found) {
            setFile(null);
            setReceived(true);
            setUncertain(false);
            setError('');
            if (input.current) input.current.value = '';
        }
    }
    async function upload() {
        if (
            !file ||
            submitting.current ||
            blocked ||
            uncertain ||
            order.status !== 'waiting_payment'
        )
            return;
        const invalid = paymentProofError(file);
        if (invalid) {
            setError(invalid);
            return;
        }
        submitting.current = true;
        setBusy(true);
        setError('');
        setReceived(false);
        const selected = file;
        let dispatched = false;
        try {
            const hash = await crypto.subtle.digest(
                'SHA-256',
                await selected.arrayBuffer(),
            );
            fingerprint.current = Array.from(new Uint8Array(hash), (byte) =>
                byte.toString(16).padStart(2, '0'),
            ).join('');
            priorIds.current = order.documents.paymentProofs.map(
                (proof) => proof.id,
            );
            dispatched = true;
            const current = await storeApi.proof(
                order.id,
                order.version,
                selected,
            );
            saved(current);
            setFile(null);
            setReceived(true);
            if (input.current) input.current.value = '';
        } catch (failure) {
            setError(storeError(failure));
            if (
                dispatched &&
                (!(failure instanceof ClientApiError) ||
                    failure.uncertain ||
                    failure.status === 409)
            ) {
                setUncertain(true);
                await reconcile();
            }
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    return (
        <section className="store-section">
            <h2>Платёжное поручение</h2>
            {order.status === 'waiting_payment' && (
                <p>После проверки документа менеджер подтвердит оплату.</p>
            )}
            {received && order.status === 'waiting_payment' && (
                <p role="status">
                    Платёжное поручение получено. Подтверждение оплаты ожидается
                    от менеджера.
                </p>
            )}
            {error && (
                <p role="alert" className="store-error">
                    {error}
                </p>
            )}
            {order.status === 'waiting_payment' ? (
                <>
                    <label className="field">
                        <span>PDF или изображение, до 20 МиБ</span>
                        <input
                            ref={input}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            disabled={busy || uncertain || blocked}
                            onChange={(event) => {
                                setFile(event.target.files?.[0] ?? null);
                                setError('');
                                setReceived(false);
                            }}
                        />
                    </label>
                    {file && <p>{file.name}</p>}
                    <Button
                        disabled={!file || busy || uncertain || blocked}
                        onClick={() => void upload()}
                    >
                        <Upload size={17} />
                        {busy
                            ? 'Отправляем документ'
                            : 'Отправить платёжное поручение'}
                    </Button>
                </>
            ) : (
                <p>
                    Загрузка сейчас недоступна:{' '}
                    {['paid', 'fulfilled', 'completed'].includes(order.status)
                        ? 'оплата уже подтверждена.'
                        : order.status === 'cancelled'
                          ? 'заказ отменён.'
                          : 'дождитесь счёта или проверьте статус заказа.'}
                </p>
            )}
            {uncertain && (
                <div className="store-error">
                    <p>
                        Проверьте документы заказа перед повтором. Выбранный
                        файл сохранён в этой вкладке.
                    </p>
                    <Button
                        variant="secondary"
                        disabled={busy || blocked}
                        onClick={() => void reconcile()}
                    >
                        Перечитать заказ
                    </Button>
                    {checked &&
                        !blocked &&
                        order.status === 'waiting_payment' && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setUncertain(false);
                                    setChecked(false);
                                }}
                            >
                                Документа нет, разрешить повтор
                            </Button>
                        )}
                </div>
            )}
        </section>
    );
}
