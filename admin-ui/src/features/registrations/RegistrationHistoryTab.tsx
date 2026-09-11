import { fmtDate } from '../../format';
import { RegistrationActionButton } from './RegistrationActions';
import {
    requirementLabels,
    type RegistrationDetailData,
    type ActionSelection,
} from './types';
const requestLabels = {
    open: 'Создан',
    delivered: 'Отправлен в канал',
    delivery_failed: 'Ошибка доставки',
    answered: 'Клиент ответил',
    closed: 'Закрыт',
};
export function RegistrationHistoryTab({
    data,
    onAction,
}: {
    data: RegistrationDetailData;
    onAction: (selection: ActionSelection) => void;
}) {
    return (
        <div className="reg-history">
            <section>
                <h2>Запросы клиенту</h2>
                {data.dataRequests.length ? (
                    data.dataRequests.map((request) => {
                        const requirement = data.requirements.find(
                            (item) => item.id === request.requirementId,
                        );
                        return (
                            <article key={request.id}>
                                <header>
                                    <h3>
                                        {requirement
                                            ? requirementLabels[
                                                  requirement.kind
                                              ]
                                            : `Запрос #${request.id}`}
                                    </h3>
                                    <span className="admin-status">
                                        {request.status === 'delivered' &&
                                        request.targetChannel === 'web'
                                            ? 'Доступен на сайте'
                                            : requestLabels[request.status]}
                                    </span>
                                </header>
                                <p>{request.requestText}</p>
                                <small>
                                    Создан: {fmtDate(request.createdAt)}
                                    {request.deliveredAt
                                        ? ` · Опубликован / отправлен: ${fmtDate(request.deliveredAt)}`
                                        : ''}
                                    {request.answeredAt
                                        ? ` · Ответ: ${fmtDate(request.answeredAt)}`
                                        : ''}
                                    {request.closedAt
                                        ? ` · Закрыт: ${fmtDate(request.closedAt)}`
                                        : ''}
                                </small>
                                {request.targetChannel === 'web' && (
                                    <p className="admin-muted">
                                        Доступен в текущем клиентском сценарии.
                                        Отдельное уведомление не отправляется.
                                    </p>
                                )}
                                {request.deliveryError && (
                                    <p role="alert">{request.deliveryError}</p>
                                )}
                                {request.status === 'delivery_failed' &&
                                    requirement && (
                                        <RegistrationActionButton
                                            action={requirement.actions.find(
                                                (action) =>
                                                    action.id ===
                                                    'request-data',
                                            )}
                                            requirement={requirement}
                                            onAction={onAction}
                                        />
                                    )}
                            </article>
                        );
                    })
                ) : (
                    <p className="admin-muted">Запросов пока нет.</p>
                )}
            </section>
            <section>
                <h2>Зафиксированные действия</h2>
                <p className="admin-muted">
                    До {data.historyLimit} записей о комплектности, документах и
                    внутренней передаче. Это не полная история переписки.
                </p>
                {data.history.length ? (
                    <ol>
                        {data.history.map((item) => (
                            <li key={item.id}>
                                <div>
                                    <strong>{item.label}</strong>
                                    <small>
                                        {{
                                            staff: 'Сотрудник',
                                            customer: 'Клиент',
                                            system: 'Система',
                                        }[item.actorType] || 'Действие'}{' '}
                                        · {fmtDate(item.createdAt)}
                                    </small>
                                </div>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p>Зафиксированных действий пока нет.</p>
                )}
            </section>
        </div>
    );
}
