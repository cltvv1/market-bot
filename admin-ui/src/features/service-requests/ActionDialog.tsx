import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import { priorityText, statusText } from '../../format';
import type { Staff } from '../../types';
import { Dialog } from '../../app/Dialog';
import { ReadState } from '../../app/primitives';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { executeAction, commandError, formText } from './service-api';
import {
    actionLabels,
    type ServiceAction,
    type ServiceDetailData,
} from './types';

function localTime(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
}
export function ActionDialog({
    action,
    data,
    onClose,
    onChanged,
}: {
    action: ServiceAction;
    data: ServiceDetailData;
    onClose: () => void;
    onChanged: () => void;
}) {
    const engineers = useRead<Staff[]>(
        action.id === 'assign_engineer' ? '/admin/api/staff/engineers' : null,
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [conflict, setConflict] = useState(false);
    const pending = useRef(false);
    const { notify } = useSession();
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (pending.current || conflict) return;
        const form = new FormData(e.currentTarget);
        const values: Record<string, unknown> = {};
        let file: File | undefined;
        if (action.id === 'assign_engineer')
            values.assignedEngineerId = Number(form.get('engineer'));
        if (action.id === 'update_operator_state') {
            values.priority = form.get('priority');
            values.operatorComment = formText(form, 'comment');
        }
        if (
            action.id === 'schedule_visit' ||
            action.id === 'reschedule_visit'
        ) {
            values.visitAddress = formText(form, 'address');
            values.visitTime = new Date(formText(form, 'time')).toISOString();
            values.operatorComment = formText(form, 'comment');
        }
        if (action.id === 'upload_invoice' || action.id === 'replace_invoice') {
            const selected = form.get('invoice');
            if (
                !(selected instanceof File) ||
                !selected.size ||
                selected.size > 15 * 1024 * 1024 ||
                !selected.name.toLowerCase().endsWith('.pdf')
            ) {
                setError('Выберите PDF-файл размером до 15 МБ.');
                return;
            }
            file = selected;
        }
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            await executeAction(data.request.id, action, values, file);
            onChanged();
            onClose();
        } catch (reason) {
            if (reason instanceof ApiError && reason.status === 409) {
                notify(commandError(reason));
                setError(
                    `${commandError(reason)} Закройте форму и выберите действие заново. Введённые данные пока остаются здесь.`,
                );
                setConflict(true);
                onChanged();
            } else setError(commandError(reason));
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }
    const request = data.request;
    return (
        <Dialog title={actionLabels[action.id]} onClose={onClose} busy={busy}>
            <form className="admin-form" onSubmit={(e) => void submit(e)}>
                {action.targetStatus && (
                    <p>
                        {statusText(request.status)} →{' '}
                        {statusText(action.targetStatus)}
                    </p>
                )}
                {action.id === 'assign_engineer' &&
                    (!engineers.data ? (
                        <ReadState {...engineers} />
                    ) : (
                        <label>
                            Инженер
                            <select
                                name="engineer"
                                required
                                defaultValue={
                                    request.assignedEngineer?.id || ''
                                }
                            >
                                <option value="" disabled>
                                    Выберите инженера
                                </option>
                                {engineers.data.map((staff) => (
                                    <option key={staff.id} value={staff.id}>
                                        {staff.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ))}
                {action.id === 'update_operator_state' && (
                    <>
                        <label>
                            Приоритет
                            <select
                                name="priority"
                                defaultValue={request.priority}
                            >
                                {(
                                    ['low', 'normal', 'high', 'urgent'] as const
                                ).map((priority) => (
                                    <option value={priority} key={priority}>
                                        {priorityText(priority)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Внутренний комментарий
                            <textarea
                                name="comment"
                                rows={4}
                                maxLength={4000}
                                defaultValue={request.operatorComment || ''}
                            />
                        </label>
                    </>
                )}
                {(action.id === 'upload_invoice' ||
                    action.id === 'replace_invoice') && (
                    <>
                        <label>
                            Счёт в PDF
                            <input
                                type="file"
                                name="invoice"
                                accept="application/pdf,.pdf"
                                required
                            />
                        </label>
                        {action.id === 'replace_invoice' && (
                            <p>
                                Новый счёт заменит текущий. Прежний документ
                                останется в истории заявки.
                            </p>
                        )}
                    </>
                )}
                {(action.id === 'schedule_visit' ||
                    action.id === 'reschedule_visit') && (
                    <>
                        <label>
                            Адрес визита
                            <input
                                name="address"
                                required
                                maxLength={500}
                                defaultValue={request.visitAddress || ''}
                            />
                        </label>
                        <label>
                            Дата и время
                            <input
                                type="datetime-local"
                                name="time"
                                required
                                defaultValue={localTime(request.visitTime)}
                            />
                        </label>
                        <label>
                            Комментарий к визиту
                            <textarea
                                name="comment"
                                maxLength={4000}
                                rows={3}
                            />
                        </label>
                    </>
                )}
                {action.id === 'confirm_payment' && (
                    <p className="admin-notice">
                        Платёжка не подтверждает поступление денег. Подтвердите
                        оплату только после проверки поступления.
                    </p>
                )}
                {action.id === 'cancel_request' && (
                    <p>
                        Отменить заявку {request.requestNumber}? Клиент получит
                        уведомление.
                    </p>
                )}
                {action.id === 'close_request' && (
                    <p>Закрыть выполненную заявку {request.requestNumber}?</p>
                )}
                {action.targetStatus &&
                    ![
                        'confirm_payment',
                        'cancel_request',
                        'close_request',
                        'upload_invoice',
                        'replace_invoice',
                        'schedule_visit',
                        'reschedule_visit',
                    ].includes(action.id) && (
                        <p>
                            {actionLabels[action.id]}: {request.requestNumber}
                        </p>
                    )}
                {error && <p role="alert">{error}</p>}
                <div className="admin-actions">
                    <button
                        type="button"
                        className="admin-button"
                        disabled={busy}
                        onClick={onClose}
                    >
                        Отмена
                    </button>
                    <button
                        className="admin-button admin-button--primary"
                        disabled={
                            busy ||
                            conflict ||
                            (action.id === 'assign_engineer' &&
                                !engineers.data?.length)
                        }
                    >
                        {busy ? 'Сохраняем…' : actionLabels[action.id]}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
