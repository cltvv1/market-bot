import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClientApiError, errorText } from '../../api/client-session';
import type {
    Readiness,
    RegistrationStatus,
    RequirementKind,
    RequirementStatus,
} from './types';
export const statusLabel: Record<RegistrationStatus, string> = {
    draft: 'Черновик',
    new: 'Передана на проверку',
    in_work: 'Обрабатывается',
    processed: 'Передана инженеру',
};
export const readinessLabel: Record<Readiness, string> = {
    incomplete: 'Нужны дополнительные данные',
    awaiting_customer: 'Ждём ваш ответ',
    awaiting_verification: 'Данные на проверке',
    ready: 'Данные комплектны',
};
export const requirementLabel: Record<RequirementKind, string> = {
    kkt_serial: 'Заводской номер ККТ',
    fiscal_drive_serial: 'Номер фискального накопителя',
    ofd_code: 'Код активации ОФД',
};
export const requirementStatus: Record<RequirementStatus, string> = {
    missing: 'Нет данных',
    requested: 'Нужен ваш ответ',
    provided: 'Получено, ожидает проверки',
    verified: 'Проверено сотрудником',
    not_required: 'Не требуется',
};
export const dateText = (value: string | null | undefined) =>
    value
        ? new Date(value).toLocaleString('ru-RU', {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Не указано';
export function RegistrationSessionNote() {
    return (
        <p className="svc-caption">
            Анкеты доступны в текущей сессии этого браузера. На другом
            устройстве или после очистки данных браузера доступ не
            восстанавливается автоматически.
        </p>
    );
}
export function RegistrationError({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    const lost = error instanceof ClientApiError && error.status === 401;
    return (
        <div className="svc-notice svc-error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div>
                <p>
                    {lost
                        ? 'Эта сессия браузера больше недоступна. Создание новой анкеты не восстановит прежние данные.'
                        : errorText(error)}
                </p>
                {retry && (
                    <button className="ref-button" onClick={retry}>
                        <RefreshCw size={16} />
                        Повторить чтение
                    </button>
                )}
                {lost && (
                    <Link className="ref-button" to="/cash-registration">
                        К началу регистрации
                    </Link>
                )}
            </div>
        </div>
    );
}
export function RegistrationBack() {
    return (
        <Link className="svc-back" to="/registrations">
            <ArrowLeft size={17} />
            Мои регистрации
        </Link>
    );
}
export function RegistrationLoading() {
    return (
        <p className="svc-loading" role="status">
            Загрузка анкеты...
        </p>
    );
}
