import { useState, type FormEvent, useId } from 'react';
import {
    Check,
    FileCheck,
    Link2,
    Pencil,
    Send,
    SlidersHorizontal,
    Unlink,
    X,
} from 'lucide-react';
import { Dialog } from '../../app/Dialog';
import { useRead } from '../../app/use-read';
import { ApiError } from '../../api';
import { priorityText } from '../../format';
import { registrationCommand, registrationError } from './api';
import {
    actionLabels,
    ofdLabels,
    statusLabels,
    type ActionSelection,
    type RegistrationAction,
    type RegistrationDetailData,
    type RegistrationOptions,
    type Requirement,
} from './types';

const icons = {
    'operator-state': SlidersHorizontal,
    'provide-value': Pencil,
    verify: Check,
    'request-data': Send,
    're-request': Send,
    'not-required': X,
    'ofd-mode': SlidersHorizontal,
    'equipment-kit': Link2,
    'link-evidence': Link2,
    'remove-evidence': Unlink,
    'final-pdf': FileCheck,
    handoff: Send,
};
export function RegistrationActionButton({
    action,
    requirement,
    evidenceId,
    onAction,
}: {
    action?: RegistrationAction;
    requirement?: Requirement;
    evidenceId?: number;
    onAction: (selection: ActionSelection) => void;
}) {
    const reasonId = useId();
    if (!action) return null;
    const Icon = icons[action.id];
    return (
        <div className="reg-action">
            <button
                className="admin-button"
                disabled={!action.allowed}
                aria-describedby={action.reason ? reasonId : undefined}
                onClick={() => onAction({ action, requirement, evidenceId })}
            >
                <Icon size={16} />
                {actionLabels[action.id]}
            </button>
            {action.reason && <small id={reasonId}>{action.reason}</small>}
        </div>
    );
}

export function RegistrationActionDialog({
    selection,
    data,
    loading,
    onChanged,
    onClose,
}: {
    selection: ActionSelection;
    data: RegistrationDetailData;
    loading: boolean;
    onChanged: () => void;
    onClose: () => void;
}) {
    const [snapshot, setSnapshot] = useState(selection);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [reviewRequired, setReviewRequired] = useState(false);
    const [mode, setMode] = useState(data.registration.ofdProvisionMode);
    const action = snapshot.action.id;
    const options = useRead<RegistrationOptions>(
        ['equipment-kit', 'handoff'].includes(action)
            ? `/admin/api/registrations/${data.registration.id}/options`
            : null,
    );
    const currentRequirement = data.requirements.find(
        (item) => item.kind === snapshot.requirement?.kind,
    );
    const currentAction = (
        snapshot.requirement
            ? currentRequirement?.actions
            : data.workflow.actions
    )?.find((item) => item.id === action);
    const text = (form: FormData, key: string) => {
        const value = form.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || reviewRequired) return;
        const form = new FormData(event.currentTarget);
        const values: Record<string, unknown> = {};
        for (const key of [
            'text',
            'comment',
            'reason',
            'value',
            'source',
            'mode',
            'priority',
            'status',
        ])
            if (form.has(key) && text(form, key)) values[key] = text(form, key);
        for (const key of ['kitId', 'engineerId', 'evidenceId'])
            if (text(form, key)) values[key] = Number(text(form, key));
        setBusy(true);
        setError('');
        try {
            await registrationCommand(data.registration.id, snapshot, values);
            onChanged();
            onClose();
        } catch (caught) {
            setError(registrationError(caught));
            setReviewRequired(
                !(caught instanceof ApiError) ||
                    caught.status >= 500 ||
                    caught.status === 409,
            );
            onChanged();
            if (
                caught instanceof ApiError &&
                [401, 403, 404].includes(caught.status)
            )
                onClose();
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog title={actionLabels[action]} busy={busy} onClose={onClose}>
            <form className="reg-form" onSubmit={(event) => void submit(event)}>
                {snapshot.requirement && (
                    <p className="admin-muted">
                        {snapshot.requirement.kind === 'ofd_code'
                            ? 'Код активации ОФД'
                            : snapshot.requirement.value ||
                              'Значение ещё не предоставлено'}{' '}
                        · версия {snapshot.requirement.version}
                    </p>
                )}
                {action === 'operator-state' && (
                    <>
                        <label>
                            Приоритет
                            <select
                                name="priority"
                                defaultValue={data.registration.priority}
                            >
                                {(
                                    ['low', 'normal', 'high', 'urgent'] as const
                                ).map((value) => (
                                    <option key={value} value={value}>
                                        {priorityText(value)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {['new', 'in_work'].includes(
                            data.registration.status,
                        ) &&
                            !data.registration.handedOffAt && (
                                <label>
                                    Обработка
                                    <select
                                        name="status"
                                        defaultValue={data.registration.status}
                                    >
                                        <option value="new">Новая</option>
                                        <option value="in_work">
                                            В работе
                                        </option>
                                    </select>
                                </label>
                            )}
                    </>
                )}
                {action === 'provide-value' && (
                    <>
                        <label>
                            Значение
                            <input
                                name="value"
                                required
                                maxLength={500}
                                autoComplete="off"
                                defaultValue={
                                    snapshot.requirement?.kind === 'ofd_code'
                                        ? ''
                                        : snapshot.requirement?.value || ''
                                }
                            />
                        </label>
                        <label>
                            Источник
                            <select name="source" defaultValue="operator_input">
                                <option value="operator_input">
                                    Ввод сотрудника
                                </option>
                                <option value="sold_by_vitma">
                                    Предоставлено ВИТМА
                                </option>
                            </select>
                        </label>
                        <p>
                            После сохранения значение потребуется проверить
                            отдельно.
                        </p>
                    </>
                )}
                {action === 'verify' && (
                    <>
                        <p>
                            Подтверждаю, что проверил значение и источник. При
                            изменении данных проверку потребуется повторить.
                        </p>
                        <label>
                            Внутренний комментарий проверки
                            <textarea name="comment" maxLength={2000} />
                        </label>
                    </>
                )}
                {['request-data', 're-request'].includes(action) && (
                    <>
                        {action === 're-request' && (
                            <p className="reg-warning">
                                Текущее подтверждение будет отозвано.
                                Потребуется новая проверка.
                            </p>
                        )}
                        <label>
                            Текст запроса клиенту
                            <textarea name="text" required maxLength={2000} />
                        </label>
                        {data.registration.platform === 'web' && (
                            <p>
                                Запрос появится в текущем клиентском сценарии на
                                сайте. Email, SMS и push не отправляются.
                            </p>
                        )}
                    </>
                )}
                {action === 'not-required' && (
                    <label>
                        Причина неприменимости
                        <textarea
                            name="reason"
                            required
                            minLength={3}
                            maxLength={1000}
                        />
                    </label>
                )}
                {action === 'ofd-mode' && (
                    <>
                        <label>
                            Способ подключения
                            <select
                                name="mode"
                                value={mode}
                                onChange={(event) =>
                                    setMode(event.target.value as typeof mode)
                                }
                            >
                                {Object.entries(ofdLabels).map(
                                    ([id, title]) => (
                                        <option key={id} value={id}>
                                            {title}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>
                        {mode === 'not_applicable' && (
                            <label>
                                Причина неприменимости ОФД
                                <textarea
                                    name="reason"
                                    required
                                    minLength={3}
                                    maxLength={1000}
                                />
                            </label>
                        )}
                        {mode === 'purchase_from_vitma' && (
                            <p>
                                Код предоставляет ВИТМА. Договорённость о
                                покупке не заменяет получение и проверку кода.
                            </p>
                        )}
                    </>
                )}
                {action === 'equipment-kit' && (
                    <>
                        <label>
                            Свободный комплект
                            <select name="kitId" required defaultValue="">
                                <option value="">Выберите комплект</option>
                                {options.data?.kits.map((kit) => (
                                    <option key={kit.id} value={kit.id}>
                                        {[
                                            kit.cashRegisterModel,
                                            kit.cashRegisterSerial,
                                            kit.fiscalDriveSerial,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ') ||
                                            `Комплект #${kit.id}`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p>
                            Данные комплекта станут полученными, но не
                            проверенными.
                        </p>
                        {options.data && (
                            <small>
                                Показано до {options.data.limit} свободных
                                комплектов.
                            </small>
                        )}
                    </>
                )}
                {action === 'handoff' && (
                    <>
                        <label>
                            Инженер
                            <select
                                name="engineerId"
                                defaultValue={
                                    data.registration.assignedEngineer?.id || ''
                                }
                            >
                                <option value="">Без назначения</option>
                                {options.data?.engineers.map((engineer) => (
                                    <option
                                        key={engineer.id}
                                        value={engineer.id}
                                    >
                                        {engineer.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p>
                            Внутренняя передача регистрации. Это не
                            подтверждение регистрации кассы в ФНС.
                        </p>
                        {data.registration.handedOffAt && (
                            <p>
                                Регистрация уже передана. Повтор не изменит
                                назначение.
                            </p>
                        )}
                    </>
                )}
                {action === 'link-evidence' && (
                    <label>
                        Подтверждение
                        <select name="evidenceId" required defaultValue="">
                            <option value="">Выберите документ</option>
                            {data.evidence
                                .filter(
                                    (file) =>
                                        file.downloadable &&
                                        file.requirementId !==
                                            snapshot.requirement?.id,
                                )
                                .map((file) => (
                                    <option key={file.id} value={file.id}>
                                        {file.originalName}
                                    </option>
                                ))}
                        </select>
                    </label>
                )}
                {action === 'remove-evidence' && (
                    <p>
                        Будет удалена только эта связь с документом. Проверка
                        связанного значения будет отозвана; другие связи файла
                        сохранятся.
                    </p>
                )}
                {action === 'final-pdf' && (
                    <p>
                        Будет сформирован документ по проверенным данным. Если
                        данные изменятся во время подготовки, прежний документ
                        сохранится.
                    </p>
                )}
                {options.loading && <p role="status">Загружаем варианты…</p>}
                {Boolean(options.error) && (
                    <div role="alert">
                        <p>Не удалось загрузить варианты.</p>
                        <button
                            type="button"
                            className="admin-button"
                            onClick={options.retry}
                        >
                            Повторить загрузку
                        </button>
                    </div>
                )}
                {error && (
                    <p role="alert" className="reg-warning">
                        {error}
                    </p>
                )}
                {reviewRequired && (
                    <section className="reg-conflict">
                        <p>
                            Ваш ввод сохранён в этом окне. Текущее состояние:{' '}
                            {statusLabels[data.registration.status]}
                            {currentRequirement
                                ? `, версия требования ${currentRequirement.version}`
                                : ''}
                            .
                        </p>
                        {currentRequirement && (
                            <p>
                                Текущее значение:{' '}
                                {currentRequirement.value || 'Не предоставлено'}
                                . Источник:{' '}
                                {currentRequirement.source || 'Не указан'}.
                            </p>
                        )}
                        <button
                            type="button"
                            className="admin-button"
                            disabled={
                                loading ||
                                !currentAction?.allowed ||
                                (action === 'verify' &&
                                    currentRequirement?.kind === 'ofd_code')
                            }
                            onClick={() => {
                                if (currentAction) {
                                    setSnapshot({
                                        ...snapshot,
                                        action: currentAction,
                                        requirement: currentRequirement,
                                    });
                                    setReviewRequired(false);
                                    setError('');
                                }
                            }}
                        >
                            Сверил карточку и историю, использовать актуальные
                            данные
                        </button>
                        {action === 'verify' &&
                            currentRequirement?.kind === 'ofd_code' && (
                                <p>
                                    Для проверки изменённого кода закройте окно,
                                    снова откройте код ОФД и проверьте его.
                                </p>
                            )}
                    </section>
                )}
                <footer className="admin-actions">
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
                            reviewRequired ||
                            options.loading ||
                            Boolean(options.error)
                        }
                    >
                        <Check size={16} />
                        {busy ? 'Выполняем…' : actionLabels[action]}
                    </button>
                </footer>
            </form>
        </Dialog>
    );
}
