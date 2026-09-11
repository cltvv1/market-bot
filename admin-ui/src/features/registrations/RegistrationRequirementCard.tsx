import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { api } from '../../api';
import { fmtDate } from '../../format';
import { RegistrationActionButton } from './RegistrationActions';
import { RegistrationDocumentRow } from './RegistrationDocumentsTab';
import {
    requirementLabels,
    requirementStatusLabels,
    sourceLabels,
    type Requirement,
    type Evidence,
    type ActionSelection,
} from './types';

export function RegistrationRequirementCard({
    registrationId,
    item,
    evidence,
    revision,
    onAction,
}: {
    registrationId: number;
    item: Requirement;
    evidence: Evidence[];
    revision: number;
    onAction: (action: ActionSelection) => void;
}) {
    const [revealed, setRevealed] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    useEffect(() => {
        setRevealed(null);
        setBusy(false);
        setError('');
        request.current?.abort();
        const clear = () => {
            request.current?.abort();
            setRevealed(null);
        };
        window.addEventListener('vitma:forbidden', clear);
        window.addEventListener('vitma:unauthorized', clear);
        return () => {
            window.removeEventListener('vitma:forbidden', clear);
            window.removeEventListener('vitma:unauthorized', clear);
        };
    }, [registrationId, revision, item.version]);
    useEffect(
        () => () => {
            request.current?.abort();
        },
        [],
    );
    async function reveal() {
        if (revealed !== null) {
            setRevealed(null);
            return;
        }
        const controller = new AbortController();
        request.current?.abort();
        request.current = controller;
        setBusy(true);
        setError('');
        try {
            const result = await api<{ value: string | null }>(
                `/admin/api/registrations/${registrationId}/ofd-value`,
                { cache: 'no-store', signal: controller.signal },
            );
            if (!controller.signal.aborted) setRevealed(result.value);
        } catch {
            if (!controller.signal.aborted)
                setError('Код недоступен. Обновите карточку.');
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <article
            className="reg-requirement"
            aria-label={requirementLabels[item.kind]}
        >
            <header>
                <h3>{requirementLabels[item.kind]}</h3>
                <span className="admin-status">
                    {requirementStatusLabels[item.status]}
                </span>
            </header>
            <div className="reg-value">
                <strong>{revealed ?? item.value ?? 'Не предоставлено'}</strong>
                {item.kind === 'ofd_code' && item.hasValue && (
                    <button
                        className="admin-icon-button"
                        disabled={busy}
                        aria-label={
                            revealed !== null
                                ? 'Скрыть код ОФД'
                                : 'Показать код ОФД'
                        }
                        title={
                            revealed !== null
                                ? 'Скрыть код ОФД'
                                : 'Показать код ОФД'
                        }
                        onClick={() => void reveal()}
                    >
                        {revealed !== null ? (
                            <EyeOff size={18} />
                        ) : (
                            <Eye size={18} />
                        )}
                    </button>
                )}
            </div>
            {error && <p role="alert">{error}</p>}
            <dl className="reg-facts">
                <div>
                    <dt>Источник</dt>
                    <dd>{sourceLabels[item.source || ''] || 'Не указан'}</dd>
                </div>
                <div>
                    <dt>Проверил</dt>
                    <dd>
                        {item.verifiedBy?.displayName || 'Не проверено'}
                        {item.verifiedAt && (
                            <small>{fmtDate(item.verifiedAt)}</small>
                        )}
                    </dd>
                </div>
            </dl>
            {item.notRequiredReason && (
                <p>
                    <strong>Причина:</strong> {item.notRequiredReason}
                </p>
            )}
            {item.operatorComment && (
                <p>
                    <strong>Внутренняя заметка:</strong> {item.operatorComment}
                </p>
            )}
            {!!evidence.length && (
                <div className="reg-evidence-list">
                    {evidence.map((file) => (
                        <RegistrationDocumentRow key={file.id} file={file} />
                    ))}
                </div>
            )}
            {!!item.actions.length && (
                <div className="reg-requirement-actions">
                    <RegistrationActionButton
                        action={item.actions.find(
                            (action) => action.id === 'provide-value',
                        )}
                        requirement={item}
                        onAction={onAction}
                    />
                    <RegistrationActionButton
                        action={item.actions.find(
                            (action) => action.id === 'verify',
                        )}
                        requirement={item}
                        onAction={onAction}
                    />
                    <details>
                        <summary>
                            <MoreHorizontal size={18} />
                            Другие действия
                        </summary>
                        <div className="reg-more-actions">
                            {item.actions
                                .filter(
                                    (action) =>
                                        !['provide-value', 'verify'].includes(
                                            action.id,
                                        ),
                                )
                                .map((action) => (
                                    <RegistrationActionButton
                                        key={action.id}
                                        action={action}
                                        requirement={item}
                                        onAction={onAction}
                                    />
                                ))}
                        </div>
                    </details>
                </div>
            )}
        </article>
    );
}
