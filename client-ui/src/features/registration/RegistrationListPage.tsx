import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { registrationApi } from './api';
import { useRegistrationRead } from './useRegistrationRead';
import {
    dateText,
    readinessLabel,
    RegistrationError,
    RegistrationLoading,
    RegistrationSessionNote,
    statusLabel,
} from './ui';

export function RegistrationListPage() {
    const { data, error, loading, refresh } = useRegistrationRead(
        'registration-list',
        registrationApi.list,
    );
    return (
        <section className="svc-section client-reg">
            <header className="svc-page-heading svc-heading-row">
                <div>
                    <h1>Мои регистрации</h1>
                    <p>Последние регистрации в этом браузере. До 50 анкет.</p>
                </div>
                <div className="svc-actions">
                    <button
                        className="ref-icon-button"
                        title="Обновить список"
                        aria-label="Обновить список"
                        disabled={loading}
                        onClick={() => void refresh()}
                    >
                        <RefreshCw size={19} />
                    </button>
                    <Link className="ref-button" to="/cash-registration">
                        <Plus size={17} />
                        Новая регистрация
                    </Link>
                </div>
            </header>
            <RegistrationSessionNote />
            {error != null && (
                <RegistrationError error={error} retry={() => void refresh()} />
            )}
            {loading && !data && <RegistrationLoading />}
            {data && (
                <div className="svc-request-list">
                    {data.items.length ? (
                        data.items.map((row) => (
                            <article className="svc-request-row" key={row.id}>
                                <div>
                                    <span className="svc-caption">
                                        Анкета #{row.id} ·{' '}
                                        {dateText(row.createdAt)}
                                    </span>
                                    <h2>
                                        {row.orgName ||
                                            'Название ещё не заполнено'}
                                    </h2>
                                    <p>
                                        {row.kktModel ||
                                            'Модель кассы ещё не указана'}
                                    </p>
                                    <p>
                                        <span className="svc-stage">
                                            {statusLabel[row.status]}
                                        </span>{' '}
                                        · {readinessLabel[row.readiness]}
                                    </p>
                                    {row.needsCustomerAction && (
                                        <strong>Ожидается ваш ответ</strong>
                                    )}
                                </div>
                                <Link
                                    className="ref-button"
                                    to={`/registrations/${row.id}${row.canResumeDraft ? '/edit' : ''}`}
                                >
                                    {row.canResumeDraft
                                        ? 'Продолжить'
                                        : 'Открыть'}
                                    <ArrowRight size={17} />
                                </Link>
                            </article>
                        ))
                    ) : (
                        <p className="svc-empty">
                            В этой сессии пока нет регистраций.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
