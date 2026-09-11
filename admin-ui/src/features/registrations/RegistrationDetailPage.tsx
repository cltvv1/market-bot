import { useRef, useState } from 'react';
import {
    Link,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { PriorityIndicator, ReadState } from '../../app/primitives';
import { fmtDate } from '../../format';
import { RegistrationReadinessPanel } from './RegistrationReadinessPanel';
import { RegistrationApplicationTab } from './RegistrationApplicationTab';
import { RegistrationDocumentsTab } from './RegistrationDocumentsTab';
import { RegistrationHistoryTab } from './RegistrationHistoryTab';
import {
    RegistrationActionButton,
    RegistrationActionDialog,
} from './RegistrationActions';
import {
    readinessLabels,
    statusLabels,
    type ActionSelection,
    type RegistrationDetailData,
} from './types';
import { registrationQueuePath } from './api';

const tabs = [
    { id: 'readiness', title: 'Комплектность' },
    { id: 'application', title: 'Анкета' },
    { id: 'documents', title: 'Документы' },
    { id: 'history', title: 'Запросы и история' },
];
export function RegistrationDetailPage() {
    const { id = '' } = useParams();
    return <RegistrationDetail key={id} id={id} />;
}
function RegistrationDetail({ id }: { id: string }) {
    const { revision, refresh } = useSession();
    const result = useRead<RegistrationDetailData>(
        /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647
            ? `/admin/api/registrations/${id}`
            : null,
        revision,
    );
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const [selection, setSelection] = useState<ActionSelection | null>(null);
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const state: unknown = location.state;
    const back =
        state &&
        typeof state === 'object' &&
        'queueUrl' in state &&
        typeof state.queueUrl === 'string' &&
        /^\/requests\/registrations(?:\?|$)/.test(state.queueUrl)
            ? state.queueUrl
            : registrationQueuePath;
    const tab = tabs.some((item) => item.id === params.get('tab'))
        ? params.get('tab')!
        : 'readiness';
    const choose = (next: string) => {
        const query = new URLSearchParams(params);
        query.set('tab', next);
        setParams(query, { state });
        setSelection(null);
    };
    const backLink = (
        <Link
            className="admin-back"
            to={back}
            state={{ selectedId: Number(id) }}
        >
            <ArrowLeft size={17} />К очереди регистраций
        </Link>
    );
    const data = result.data;
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
    const row = data.registration;
    const changed = () => {
        result.retry();
        refresh();
    };
    return (
        <div className="reg-workspace">
            {backLink}
            <header className="admin-detail-heading">
                <div className="admin-row-meta">
                    <span>Анкета #{row.id}</span>
                    <span>
                        {{ web: 'Сайт', telegram: 'Telegram', max: 'MAX' }[
                            row.platform
                        ] || row.platform}
                    </span>
                    <PriorityIndicator priority={row.priority} />
                </div>
                <h1>{row.application.orgName || 'Регистрация ККТ'}</h1>
                <p className="admin-muted">
                    {row.application.kktModel || 'Модель не указана'} ·{' '}
                    {fmtDate(row.createdAt)}
                </p>
                <div className="reg-detail-status">
                    <span className="admin-status">
                        {statusLabels[row.status]}
                    </span>
                    <span className="admin-status">
                        {readinessLabels[row.readiness]}
                    </span>
                </div>
                <dl className="reg-facts reg-header-facts">
                    <div>
                        <dt>Внутренняя передача</dt>
                        <dd>
                            {row.handedOffAt
                                ? fmtDate(row.handedOffAt)
                                : 'Не передана'}
                        </dd>
                    </div>
                    <div>
                        <dt>Инженер</dt>
                        <dd>
                            {row.assignedEngineer?.displayName || 'Не назначен'}
                        </dd>
                    </div>
                    <div>
                        <dt>Документ</dt>
                        <dd>
                            {data.pdf
                                ? {
                                      final: 'Финальный PDF',
                                      draft: 'Предварительный PDF',
                                      unknown: 'Документ',
                                  }[data.pdf.classification]
                                : 'Не подготовлен'}
                        </dd>
                    </div>
                </dl>
                <div className="admin-actions">
                    <RegistrationActionButton
                        action={data.workflow.actions.find(
                            (action) => action.id === 'operator-state',
                        )}
                        onAction={setSelection}
                    />
                    <RegistrationActionButton
                        action={data.workflow.actions.find(
                            (action) => action.id === 'handoff',
                        )}
                        onAction={setSelection}
                    />
                </div>
            </header>
            <div
                className="admin-tabs reg-tabs"
                role="tablist"
                aria-label="Карточка регистрации"
            >
                {tabs.map((item, index) => (
                    <button
                        key={item.id}
                        ref={(element) => {
                            buttons.current[index] = element;
                        }}
                        id={`reg-tab-${item.id}`}
                        role="tab"
                        aria-selected={tab === item.id}
                        aria-controls={`reg-panel-${item.id}`}
                        tabIndex={tab === item.id ? 0 : -1}
                        onClick={() => choose(item.id)}
                        onKeyDown={(event) => {
                            const next =
                                event.key === 'ArrowRight'
                                    ? (index + 1) % tabs.length
                                    : event.key === 'ArrowLeft'
                                      ? (index + tabs.length - 1) % tabs.length
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? tabs.length - 1
                                          : null;
                            if (next !== null) {
                                event.preventDefault();
                                choose(tabs[next].id);
                                buttons.current[next]?.focus();
                            }
                        }}
                    >
                        {item.title}
                    </button>
                ))}
            </div>
            <div
                id={`reg-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`reg-tab-${tab}`}
                tabIndex={0}
                className="reg-panel"
            >
                {tab === 'readiness' && (
                    <RegistrationReadinessPanel
                        data={data}
                        revision={revision}
                        onAction={setSelection}
                    />
                )}
                {tab === 'application' && (
                    <RegistrationApplicationTab application={row.application} />
                )}
                {tab === 'documents' && (
                    <RegistrationDocumentsTab
                        data={data}
                        onAction={setSelection}
                    />
                )}
                {tab === 'history' && (
                    <RegistrationHistoryTab
                        data={data}
                        onAction={setSelection}
                    />
                )}
            </div>
            {selection && (
                <RegistrationActionDialog
                    selection={selection}
                    data={data}
                    loading={result.loading}
                    onChanged={changed}
                    onClose={() => setSelection(null)}
                />
            )}
        </div>
    );
}
