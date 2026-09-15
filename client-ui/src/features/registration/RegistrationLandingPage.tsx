import { useRef, useState } from 'react';
import { ArrowRight, FilePenLine } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
    beginNewSession,
    isSessionError,
    ClientApiError,
} from '../../api/client-session';
import { registrationApi } from './api';
import { useRegistrationRead } from './useRegistrationRead';
import {
    RegistrationError,
    RegistrationLoading,
    RegistrationSessionNote,
} from './ui';

export function RegistrationLandingPage() {
    const navigate = useNavigate();
    const { data, error, loading, refresh } = useRegistrationRead(
        'registration-landing',
        (signal) => registrationApi.list(signal, false),
    );
    const [busy, setBusy] = useState(false);
    const active = useRef(false);
    const [actionError, setActionError] = useState<unknown>();
    const draft = data?.items.find((item) => item.canResumeDraft);
    const start = async () => {
        if (active.current) return;
        active.current = true;
        setBusy(true);
        setActionError(undefined);
        try {
            await beginNewSession();
            const result = await registrationApi.create();
            void navigate(`/registrations/${result.registration.id}/edit`);
        } catch (failure) {
            if (failure instanceof ClientApiError && failure.uncertain) {
                const current = await registrationApi
                    .list()
                    .catch(() => undefined);
                const existing = current?.items.find(
                    (item) => item.canResumeDraft,
                );
                if (existing) {
                    void navigate(`/registrations/${existing.id}/edit`);
                    return;
                }
            }
            setActionError(failure);
        } finally {
            active.current = false;
            setBusy(false);
        }
    };
    return (
        <section className="svc-section client-reg">
            <header className="svc-page-heading">
                <span className="ref-eyebrow">Регистрация ККТ</span>
                <h1>Подготовим кассу к работе</h1>
                <p>
                    Передайте реквизиты и данные оборудования. Сотрудник
                    проверит анкету и уточнит недостающие сведения.
                </p>
            </header>
            <div className="cr-intro">
                <div>
                    <h2>Что понадобится</h2>
                    <ul>
                        <li>
                            Название организации, ИНН/КПП и телефон для связи.
                        </li>
                        <li>
                            Адрес установки и модель кассы, если они уже
                            известны.
                        </li>
                        <li>
                            Номера ККТ и ФН или фото упаковки можно передать
                            после отправки анкеты.
                        </li>
                    </ul>
                </div>
                <div>
                    <FilePenLine size={26} aria-hidden="true" />
                    <h2>Можно заполнить частями</h2>
                    <p>
                        Сохранённый черновик останется в этом браузере. Оператор
                        начнёт проверку после отправки.
                    </p>
                    {loading ? (
                        <RegistrationLoading />
                    ) : draft ? (
                        <Link
                            className="ref-button ref-button--primary"
                            to={`/registrations/${draft.id}/edit`}
                        >
                            Продолжить черновик #{draft.id}
                            <ArrowRight size={17} />
                        </Link>
                    ) : (
                        <button
                            className="ref-button ref-button--primary"
                            disabled={
                                busy ||
                                (error != null && !isSessionError(error))
                            }
                            onClick={() => void start()}
                        >
                            {busy
                                ? 'Подготавливаем анкету...'
                                : 'Начать новую регистрацию'}
                            <ArrowRight size={17} />
                        </button>
                    )}
                    <Link className="svc-back" to="/registrations">
                        Мои регистрации
                    </Link>
                </div>
            </div>
            {error != null && !isSessionError(error) && (
                <RegistrationError error={error} retry={() => void refresh()} />
            )}
            {actionError != null && (
                <RegistrationError
                    error={actionError}
                    retry={() => void refresh()}
                />
            )}
            <RegistrationSessionNote />
        </section>
    );
}
