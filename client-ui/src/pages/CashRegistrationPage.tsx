import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, Input, Loader, Textarea } from '../components/ui';
import {
    registrationService,
    type RegistrationFieldDto,
} from '../services/client';

const largeFields = new Set(['bankReqs', 'services', 'urAdress', 'kktAdress']);

export function CashRegistrationPage() {
    const [fields, setFields] = useState<RegistrationFieldDto[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [number, setNumber] = useState<number | null>(null);

    useEffect(() => {
        registrationService
            .getFields()
            .then(setFields)
            .catch(() =>
                setError('Не удалось загрузить анкету. Обновите страницу.'),
            )
            .finally(() => setLoading(false));
    }, []);

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
        } catch {
            setError(
                'Не удалось отправить анкету. Проверьте соединение и попробуйте ещё раз.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (number) {
        return (
            <div className="page container success-page">
                <CheckCircle2 />
                <span className="eyebrow">Анкета отправлена</span>
                <h1>Регистрация кассы · анкета #{number}</h1>
                <p>
                    Данные поступили оператору в административную панель.
                    Специалист проверит комплектность и свяжется с вами.
                </p>
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
                        ИНН, ОГРН, адрес установки ККТ и данные ОФД.
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
