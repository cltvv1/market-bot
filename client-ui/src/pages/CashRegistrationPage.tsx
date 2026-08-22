import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, Input, Loader, Textarea } from '../components/ui';
import {
    registrationService,
    type RegistrationFieldDto,
    type RegistrationChecklistDto,
    type RegistrationRequirementKind,
} from '../services/client';

const largeFields = new Set(['bankReqs', 'services', 'urAdress', 'kktAdress']);

export function CashRegistrationPage() {
    const [fields, setFields] = useState<RegistrationFieldDto[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [number, setNumber] = useState<number | null>(null);
    const [checklist, setChecklist] = useState<RegistrationChecklistDto | null>(
        null,
    );

    useEffect(() => {
        registrationService
            .getFields()
            .then((items) =>
                setFields(
                    items.filter((item) => item.name !== 'equipmentPhoto'),
                ),
            )
            .catch(() =>
                setError('Не удалось загрузить анкету. Обновите страницу.'),
            )
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!number) return;
        const timer = window.setInterval(() => {
            void registrationService
                .checklist(number)
                .then(setChecklist)
                .catch(() => undefined);
        }, 5_000);
        return () => window.clearInterval(timer);
    }, [number]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const completed = Object.fromEntries(
            Object.entries(values).filter(([, value]) => value.trim()),
        );
        if (!completed.orgName || !completed.innKpp || !completed.phoneToCall) {
            setError(
                'Заполните название организации, ИНН/КПП и телефон для связи.',
            );
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const result = await registrationService.submit(completed);
            setNumber(result.data.id);
            setChecklist(await registrationService.checklist(result.data.id));
        } catch {
            setError(
                'Не удалось отправить анкету. Проверьте соединение и попробуйте ещё раз.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (number) {
        const refresh = () =>
            registrationService.checklist(number).then(setChecklist);
        const provide = async (
            kind: RegistrationRequirementKind,
            value: string,
            file?: File,
        ) => {
            if (value.trim())
                await registrationService.value(number, kind, value);
            if (file) await registrationService.evidence(number, kind, file);
            await refresh();
        };
        return (
            <div className="page container success-page">
                <CheckCircle2 />
                <span className="eyebrow">Анкета отправлена</span>
                <h1>Регистрация кассы · анкета #{number}</h1>
                <p>
                    Анкета принята. Оператор проверит данные и при необходимости
                    запросит недостающие сведения.
                </p>
                {checklist && (
                    <section className="registration-form">
                        <h2>
                            Комплектность:{' '}
                            {readinessText(checklist.registration.readiness)}
                        </h2>
                        {checklist.requirements.map((item) => (
                            <ClientRequirement
                                key={item.id}
                                item={item}
                                requestText={
                                    checklist.dataRequests.find(
                                        (request) =>
                                            request.requirementId === item.id &&
                                            !['closed', 'answered'].includes(
                                                request.status,
                                            ),
                                    )?.requestText
                                }
                                onProvide={provide}
                            />
                        ))}
                    </section>
                )}
                <div>
                    <Link className="button button--primary" to="/service">
                        В сервисный центр
                    </Link>
                    <Link className="button button--secondary" to="/">
                        На главную
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Сервисный центр', to: '/service' },
                    { label: 'Регистрация кассы' },
                ]}
            />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Рабочая анкета</span>
                    <h1>Регистрация онлайн-кассы</h1>
                    <p>
                        Заполненная анкета сразу попадёт оператору и будет
                        сохранена в существующей системе заявок.
                    </p>
                </div>
            </header>
            <div className="registration-intro">
                <div>
                    <FileText />
                    <span>
                        <strong>Подготовьте реквизиты</strong>
                        ИНН, ОГРН и адрес установки ККТ. Номера оборудования
                        можно дослать после отправки.
                    </span>
                </div>
                <div>
                    <ShieldCheck />
                    <span>
                        <strong>Проверим перед регистрацией</strong>
                        Оператор свяжется, если потребуется уточнение.
                    </span>
                </div>
            </div>
            {loading ? (
                <Loader label="Загружаем анкету" />
            ) : (
                <form
                    className="registration-form"
                    onSubmit={(event) => void submit(event)}
                    noValidate
                >
                    <div className="form-section-title">
                        <span>01</span>
                        <div>
                            <h2>Данные для регистрации</h2>
                            <p>
                                Заполняйте сведения так, как они указаны в
                                документах.
                            </p>
                        </div>
                    </div>
                    <div className="form-grid">
                        {fields.map((field) =>
                            largeFields.has(field.name) ? (
                                <Textarea
                                    className="field-span"
                                    key={field.name}
                                    label={field.label}
                                    value={values[field.name] || ''}
                                    onChange={(event) =>
                                        setValues((current) => ({
                                            ...current,
                                            [field.name]: event.target.value,
                                        }))
                                    }
                                />
                            ) : (
                                <Input
                                    key={field.name}
                                    label={field.label}
                                    required={[
                                        'orgName',
                                        'innKpp',
                                        'phoneToCall',
                                    ].includes(field.name)}
                                    value={values[field.name] || ''}
                                    onChange={(event) =>
                                        setValues((current) => ({
                                            ...current,
                                            [field.name]: event.target.value,
                                        }))
                                    }
                                />
                            ),
                        )}
                    </div>
                    {error && (
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                    )}
                    <footer>
                        <p>
                            Нажимая кнопку, вы соглашаетесь на обработку данных
                            для регистрации ККТ.
                        </p>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Отправляем…' : 'Отправить анкету'}
                        </Button>
                    </footer>
                </form>
            )}
        </div>
    );
}

const requirementLabels: Record<RegistrationRequirementKind, string> = {
    kkt_serial: 'Заводской номер ККТ',
    fiscal_drive_serial: 'Номер ФН',
    ofd_code: 'Код ОФД',
};
function readinessText(value: string) {
    return (
        (
            {
                incomplete: 'неполная',
                awaiting_customer: 'ожидаются данные',
                awaiting_verification: 'на проверке',
                ready: 'готова',
            } as Record<string, string>
        )[value] || value
    );
}
function ClientRequirement({
    item,
    requestText,
    onProvide,
}: {
    item: RegistrationChecklistDto['requirements'][number];
    requestText?: string;
    onProvide: (
        kind: RegistrationRequirementKind,
        value: string,
        file?: File,
    ) => Promise<void>;
}) {
    const [value, setValue] = useState('');
    const [file, setFile] = useState<File>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const locked = item.status === 'verified' || item.status === 'not_required';
    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await onProvide(item.kind, value, file);
            setValue('');
            setFile(undefined);
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : 'Не удалось передать данные',
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="context-panel">
            <strong>{requirementLabels[item.kind]}</strong>
            <span>
                {item.status}
                {item.value ? ` · ${item.value}` : ''}
            </span>
            {requestText && <p>{requestText}</p>}
            {!locked && (
                <>
                    <Input
                        label="Значение"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => setFile(event.target.files?.[0])}
                    />
                    <Button
                        disabled={busy || (!value.trim() && !file)}
                        onClick={() => void submit()}
                    >
                        Передать данные
                    </Button>
                    {error && (
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
