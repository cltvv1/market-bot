import { useRef, useState } from 'react';
import {
    Link,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { fmtDate, statusText } from '../../format';
import { useSession } from '../../app/session';
import { useRead } from '../../app/use-read';
import {
    ReadState,
    PriorityIndicator,
    StatusIndicator,
} from '../../app/primitives';
import {
    actionLabels,
    channels,
    contactName,
    type ServiceAction,
    type ServiceDetailData,
} from './types';
import { ActionDialog } from './ActionDialog';
import { PaymentDocuments, ServiceDocuments } from './ServiceDocuments';
import {
    ServiceHistory,
    ServiceMessages,
    ServiceRequestFields,
} from './ServicePanels';

const tabs = [
    { id: 'request', title: 'Заявка' },
    { id: 'messages', title: 'Переписка' },
    { id: 'documents', title: 'Документы' },
    { id: 'history', title: 'История' },
];
export function ServiceDetail() {
    const { id = '' } = useParams();
    const { revision, refresh } = useSession();
    const result = useRead<ServiceDetailData>(
        /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647
            ? `/admin/api/service-requests/${id}`
            : null,
        revision,
    );
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const [action, setAction] = useState<ServiceAction | null>(null);
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const tab = tabs.some((item) => item.id === params.get('tab'))
        ? params.get('tab')!
        : 'request';
    const state: unknown = location.state;
    const back =
        state &&
        typeof state === 'object' &&
        'queueUrl' in state &&
        typeof state.queueUrl === 'string' &&
        /^\/requests\/service(?:\?|$)/.test(state.queueUrl)
            ? state.queueUrl
            : '/requests/service';
    const choose = (next: string) => {
        const query = new URLSearchParams(params);
        query.set('tab', next);
        setParams(query, { state });
    };
    const data = result.data;
    const backLink = (
        <Link to={back} className="admin-back">
            <ArrowLeft size={17} />К списку заявок
        </Link>
    );
    if (!result.path)
        return (
            <>
                {backLink}
                <div className="admin-state">
                    <h1>Некорректная ссылка</h1>
                </div>
            </>
        );
    if (!data)
        return (
            <>
                {backLink}
                <ReadState {...result} />
            </>
        );
    const row = data.request;
    const changed = () => {
        result.retry();
        refresh();
    };
    const primary = data.workflow.actions.find(
        (item) => item.id === data.workflow.primaryActionId,
    );
    const administrative = data.workflow.actions.filter(
        (item) =>
            item.id === 'assign_engineer' ||
            item.id === 'update_operator_state',
    );
    const other = data.workflow.actions.filter(
        (item) =>
            item !== primary &&
            ![
                'assign_engineer',
                'update_operator_state',
                'send_customer_message',
                'add_internal_note',
            ].includes(item.id),
    );
    const actionButton = (item: ServiceAction, primary = false) => (
        <div className="sr-action-option" key={item.id}>
            <button
                className={`admin-button${primary ? ' admin-button--primary' : ''}`}
                disabled={!item.allowed}
                aria-describedby={item.reason ? `reason-${item.id}` : undefined}
                onClick={() => setAction(item)}
            >
                {item.id === 'confirm_payment' && <ShieldCheck size={17} />}
                {actionLabels[item.id]}
            </button>
            {item.reason && (
                <small id={`reason-${item.id}`}>{item.reason}</small>
            )}
        </div>
    );
    return (
        <>
            {backLink}
            <header className="admin-detail-heading">
                <div className="admin-row-meta">
                    <span>{row.requestNumber}</span>
                    <span>
                        {channels[row.source] ||
                            channels[row.platform] ||
                            row.source}
                    </span>
                    <PriorityIndicator priority={row.priority} />
                </div>
                <h1>{row.serviceTypeTitle}</h1>
                <div className="admin-detail-subtitle">
                    <span>{contactName(row)}</span>
                    <StatusIndicator status={row.status} />
                </div>
                <div className="admin-assignments">
                    <span>
                        Куратор:{' '}
                        <strong>
                            {row.responsibleOperator?.displayName ||
                                'Не назначен'}
                        </strong>
                    </span>
                    <span>
                        Инженер:{' '}
                        <strong>
                            {row.assignedEngineer?.displayName || 'Не назначен'}
                        </strong>
                    </span>
                    <span>Обновлена: {fmtDate(row.updatedAt)}</span>
                </div>
                <div className="admin-actions sr-administrative">
                    {administrative.map((item) => actionButton(item))}
                </div>
            </header>
            <div
                className="admin-detail-tabs"
                role="tablist"
                aria-label="Содержимое заявки"
            >
                {tabs.map((item, index) => (
                    <button
                        key={item.id}
                        ref={(element) => {
                            buttons.current[index] = element;
                        }}
                        id={`sr-tab-${item.id}`}
                        role="tab"
                        aria-selected={tab === item.id}
                        aria-controls={`sr-panel-${item.id}`}
                        tabIndex={tab === item.id ? 0 : -1}
                        onClick={() => choose(item.id)}
                        onKeyDown={(e) => {
                            const next =
                                e.key === 'ArrowRight'
                                    ? (index + 1) % tabs.length
                                    : e.key === 'ArrowLeft'
                                      ? (index + tabs.length - 1) % tabs.length
                                      : e.key === 'Home'
                                        ? 0
                                        : e.key === 'End'
                                          ? tabs.length - 1
                                          : -1;
                            if (next < 0) return;
                            e.preventDefault();
                            choose(tabs[next].id);
                            buttons.current[next]?.focus();
                        }}
                    >
                        {item.title}
                        {item.id === 'documents' && (
                            <span>
                                {
                                    [
                                        data.documents.invoice,
                                        data.documents.paymentProof,
                                        ...data.documents.attachments,
                                    ].filter(Boolean).length
                                }
                            </span>
                        )}
                    </button>
                ))}
            </div>
            <div
                className="admin-detail-panel"
                role="tabpanel"
                tabIndex={0}
                id={`sr-panel-${tab}`}
                aria-labelledby={`sr-tab-${tab}`}
            >
                {tab === 'request' && (
                    <>
                        <section className="admin-stage">
                            <div className="admin-stage-heading">
                                <div>
                                    <span className="admin-eyebrow">
                                        Текущий этап
                                    </span>
                                    <h2>
                                        {row.status === 'waiting_payment'
                                            ? 'Проверка оплаты'
                                            : statusText(row.status)}
                                    </h2>
                                </div>
                            </div>
                            <div className="admin-stage-action">
                                <div>
                                    {row.status === 'waiting_payment' && (
                                        <p>
                                            Платёжка не подтверждает поступление
                                            денег.
                                        </p>
                                    )}
                                    {!primary && (
                                        <p>
                                            Выберите следующее действие по
                                            заявке.
                                        </p>
                                    )}
                                </div>
                                {primary && actionButton(primary, true)}
                                {other.length > 0 && (
                                    <details className="sr-other-actions">
                                        <summary>
                                            <MoreHorizontal size={18} />
                                            Другие действия
                                        </summary>
                                        <div>
                                            {other.map((item) =>
                                                actionButton(item),
                                            )}
                                        </div>
                                    </details>
                                )}
                            </div>
                            {row.status === 'waiting_payment' && (
                                <PaymentDocuments data={data} />
                            )}
                        </section>
                        <ServiceRequestFields data={data} />
                    </>
                )}
                {tab === 'messages' && (
                    <ServiceMessages
                        key={row.id}
                        data={data}
                        onChanged={changed}
                    />
                )}
                {tab === 'documents' && <ServiceDocuments data={data} />}
                {tab === 'history' && <ServiceHistory data={data} />}
            </div>
            {action && (
                <ActionDialog
                    key={`${row.id}:${action.id}`}
                    action={action}
                    data={data}
                    onClose={() => setAction(null)}
                    onChanged={changed}
                />
            )}
        </>
    );
}
