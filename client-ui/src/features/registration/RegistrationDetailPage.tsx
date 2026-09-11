import { RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { registrationApi, registrationId } from './api';
import { useRegistrationRead } from './useRegistrationRead';
import {
    dateText,
    readinessLabel,
    RegistrationBack,
    RegistrationError,
    RegistrationLoading,
    RegistrationSessionNote,
    statusLabel,
} from './ui';
import { RegistrationRequirementPanel } from './RegistrationRequirementPanel';
import { RegistrationEvidenceList } from './RegistrationEvidenceList';

export function RegistrationDetailPage() {
    const { id } = useParams();
    const { data, error, loading, refresh } = useRegistrationRead(
        `registration-detail-${id}`,
        (signal) => registrationApi.detail(registrationId(id), signal),
        (detail) => ['new', 'in_work'].includes(detail.registration.status),
    );
    if (!data)
        return (
            <section className="svc-section client-reg">
                <RegistrationBack />
                {error != null ? (
                    <RegistrationError
                        error={error}
                        retry={() => void refresh()}
                    />
                ) : (
                    <RegistrationLoading />
                )}
            </section>
        );
    const row = data.registration;
    const hasRequest = data.dataRequests.some((item) =>
        ['open', 'delivered'].includes(item.status),
    );
    const next =
        row.status === 'draft'
            ? 'Анкета сохранена как черновик. Заполните реквизиты и отправьте её на проверку.'
            : row.status === 'processed'
              ? 'Анкета передана инженеру для дальнейшей работы. Это не подтверждение регистрации кассы в ФНС или активации ОФД.'
              : hasRequest || row.readiness === 'awaiting_customer'
                ? 'Сотрудник запросил уточнение. Его запросы и поля для ответа находятся ниже.'
                : row.readiness === 'ready'
                  ? 'Необходимые данные проверены. Ожидайте следующего шага от сотрудника.'
                  : 'Анкета принята. Сотрудник проверит данные и при необходимости запросит уточнение.';
    return (
        <section className="svc-section client-reg" key={id}>
            <RegistrationBack />
            <header className="svc-page-heading svc-heading-row">
                <div>
                    <span className="ref-eyebrow">
                        Анкета #{row.id} · {dateText(row.createdAt)}
                    </span>
                    <h1>{row.orgName || 'Регистрация кассы'}</h1>
                    <span className="svc-stage">{statusLabel[row.status]}</span>
                    <p>{readinessLabel[row.readiness]}</p>
                </div>
                <button
                    className="ref-icon-button"
                    title="Обновить анкету"
                    aria-label="Обновить анкету"
                    disabled={loading}
                    onClick={() => void refresh()}
                >
                    <RefreshCw size={19} />
                </button>
            </header>
            <div className="svc-next">
                <p>{next}</p>
                {data.customerWorkflow.canEditDraft && (
                    <Link
                        className="ref-button ref-button--primary"
                        to={`/registrations/${row.id}/edit`}
                    >
                        Продолжить заполнение
                    </Link>
                )}
            </div>
            {error != null && (
                <RegistrationError error={error} retry={() => void refresh()} />
            )}
            <section className="cr-section">
                <h2>Данные оборудования и подтверждения</h2>
                {!data.checklistAvailable ? (
                    <p className="svc-notice">
                        Чек-лист пока недоступен. Обратитесь к сотруднику,
                        повторно создавать анкету не нужно.
                    </p>
                ) : (
                    data.requirements.map((item) => (
                        <RegistrationRequirementPanel
                            key={item.id}
                            id={row.id}
                            item={item}
                            evidence={data.evidence.filter(
                                (file) => file.requirementId === item.id,
                            )}
                            requests={data.dataRequests.filter(
                                (request) => request.requirementId === item.id,
                            )}
                            refresh={refresh}
                        />
                    ))
                )}
            </section>
            {data.evidence.some((item) => item.requirementId === null) && (
                <section className="cr-section">
                    <h2>Дополнительные подтверждения</h2>
                    <RegistrationEvidenceList
                        items={data.evidence.filter(
                            (item) => item.requirementId === null,
                        )}
                    />
                </section>
            )}
            <section className="cr-section">
                <h2>Анкета</h2>
                <dl className="cr-application">
                    {data.form.fields.map((field) => (
                        <div key={field.name}>
                            <dt>{field.label}</dt>
                            <dd>
                                {data.application[field.name] || 'Не указано'}
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>
            <section className="cr-section">
                <h2>Запросы сотрудника</h2>
                {data.dataRequests.length ? (
                    <ul className="cr-request-history">
                        {data.dataRequests.map((item) => (
                            <li key={item.id}>
                                <p>{item.requestText}</p>
                                <span className="svc-caption">
                                    {dateText(item.createdAt)} ·{' '}
                                    {item.status === 'answered'
                                        ? 'Ответ получен'
                                        : item.status === 'closed'
                                          ? 'Закрыт'
                                          : 'Ожидается ответ'}
                                </span>
                                {item.answeredAt && (
                                    <p className="svc-caption">
                                        Ответ: {dateText(item.answeredAt)}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="svc-caption">Запросов пока нет.</p>
                )}
                <p className="svc-caption">
                    Анкета создана {dateText(row.createdAt)}. Последнее
                    изменение {dateText(row.updatedAt)}.
                </p>
                {row.handedOffAt && (
                    <p className="svc-caption">
                        Передана инженеру {dateText(row.handedOffAt)}.
                    </p>
                )}
            </section>
            <RegistrationSessionNote />
        </section>
    );
}
