import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, Input, Select, Textarea } from '../components/ui';
import { serviceDirections } from '../data/services';
import { businessSolutions, servicePackages } from '../data/solutions';
import { serviceRequestService } from '../services/client';
import type {
    ServiceRequestFormData,
    ServiceRequestRecord,
    ServiceTypeOption,
} from '../types';

const DRAFT_KEY = 'vitma_service_draft';
const empty: ServiceRequestFormData = {
    clientType: 'organization',
    organization: '',
    inn: '',
    contactName: '',
    phone: '',
    email: '',
    city: 'Красноярск',
    address: '',
    equipmentType: 'Онлайн-касса',
    equipmentModel: '',
    serialNumber: '',
    software: '',
    problemType: '',
    fiscalDriveTerm: '15',
    urgency: 'normal',
    helpFormat: 'remote',
    description: '',
    files: [],
    consent: false,
};
const labels = ['Клиент и контакты', 'Оборудование', 'Проблема', 'Проверка'];
const phoneMask = (value: string) => {
    const digits = value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11);
    const d = digits.startsWith('7') ? digits : `7${digits}`;
    return `+7${d.length > 1 ? ` (${d.slice(1, 4)}` : ''}${d.length >= 4 ? `) ${d.slice(4, 7)}` : ''}${d.length >= 7 ? `-${d.slice(7, 9)}` : ''}${d.length >= 9 ? `-${d.slice(9, 11)}` : ''}`;
};

export function ServiceRequestPage() {
    const [params] = useSearchParams();
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<ServiceRequestFormData>(() => {
        try {
            return {
                ...empty,
                ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'),
                files: [],
                consent: false,
            } as ServiceRequestFormData;
        } catch {
            return empty;
        }
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
    const [result, setResult] = useState<ServiceRequestRecord | null>(null);
    useEffect(() => {
        void serviceRequestService
            .getTypes()
            .then((items) =>
                setServiceTypes(
                    items.filter((item) =>
                        [
                            'fn_replacement',
                            'firmware_update',
                            'kkt_remote_work',
                        ].includes(item.code),
                    ),
                ),
            )
            .catch((error: unknown) =>
                setSubmitError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить список услуг',
                ),
            );
    }, []);
    useEffect(() => {
        const type = params.get('type');
        const product = params.get('product');
        const solution = params.get('solution');
        const servicePackage = params.get('package');
        if (type && serviceDirections.some((item) => item.id === type))
            setForm((current) => ({ ...current, problemType: type }));
        if (product)
            setForm((current) => ({ ...current, equipmentModel: product }));
        if (solution) {
            const selected = businessSolutions.find(
                (item) => item.id === solution,
            );
            if (selected)
                setForm((current) => ({
                    ...current,
                    description:
                        current.description ||
                        `Нужно решение для направления «${selected.title}». `,
                }));
        }
        if (servicePackage) {
            const selected = servicePackages.find(
                (item) => item.id === servicePackage,
            );
            if (selected)
                setForm((current) => ({
                    ...current,
                    description:
                        current.description ||
                        `Интересует формат «${selected.title}». `,
                }));
        }
    }, [params]);
    useEffect(() => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, files: [] }));
    }, [form]);
    const set = <K extends keyof ServiceRequestFormData>(
        key: K,
        value: ServiceRequestFormData[K],
    ) => setForm((current) => ({ ...current, [key]: value }));
    const validate = () => {
        const next: Record<string, string> = {};
        if (step === 0) {
            if (!form.problemType)
                next.problemType = 'Выберите вид сервисной заявки';
            if (form.clientType === 'organization' && !form.organization.trim())
                next.organization = 'Укажите название организации';
            if (
                form.clientType === 'organization' &&
                !/^(?:\d{10}|\d{12})$/.test(form.inn)
            )
                next.inn = 'ИНН содержит 10 или 12 цифр';
            if (form.contactName.trim().length < 2)
                next.contactName = 'Укажите контактное лицо';
            if (form.phone.replace(/\D/g, '').length !== 11)
                next.phone = 'Введите полный номер телефона';
            if (!/^\S+@\S+\.\S+$/.test(form.email))
                next.email = 'Проверьте email';
            if (!form.city.trim()) next.city = 'Укажите город';
        }
        if (step === 1) {
            if (!form.equipmentType)
                next.equipmentType = 'Выберите тип оборудования';
            if (!form.equipmentModel.trim())
                next.equipmentModel = 'Укажите модель или напишите «не знаю»';
        }
        if (step === 2) {
            if (form.description.trim().length < 20)
                next.description = 'Опишите проблему хотя бы в 20 символах';
        }
        if (step === 3 && !form.consent)
            next.consent = 'Нужно согласие на обработку данных';
        setErrors(next);
        return Object.keys(next).length === 0;
    };
    const next = () => {
        if (validate()) setStep((value) => Math.min(3, value + 1));
    };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        setSubmitError('');
        try {
            const created = await serviceRequestService.create(form);
            setResult(created);
            localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            setSubmitError(
                error instanceof Error
                    ? error.message
                    : 'Не удалось отправить заявку',
            );
        } finally {
            setSubmitting(false);
        }
    };
    const problemTitle = useMemo(
        () =>
            serviceTypes.find((item) => item.code === form.problemType)
                ?.title ||
            serviceDirections.find((item) => item.id === form.problemType)
                ?.title ||
            'Не выбран',
        [form.problemType, serviceTypes],
    );
    if (result)
        return (
            <div className="page container success-page service-success">
                <CheckCircle2 />
                <span className="eyebrow">Заявка отправлена</span>
                <h1>{result.number}</h1>
                <p>
                    Оператор проверит данные и свяжется с вами. Сохраните номер
                    — по нему можно отслеживать статус.
                </p>
                <div className="status-preview">
                    <span className="active">
                        <Check />
                        Заявка принята
                    </span>
                    <span>Назначение специалиста</span>
                    <span>Диагностика</span>
                    <span>Результат</span>
                </div>
                <div>
                    <Link
                        className="button button--primary"
                        to={`/service/status?number=${result.number}`}
                    >
                        Проверить статус
                    </Link>
                    <Link className="button button--secondary" to="/service">
                        Вернуться в сервис
                    </Link>
                </div>
            </div>
        );

    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Сервисный центр', to: '/service' },
                    { label: 'Новая заявка' },
                ]}
            />
            <header className="page-heading service-form-heading">
                <div>
                    <span className="eyebrow">Сервисная заявка</span>
                    <h1>Расскажите, что произошло</h1>
                    <p>
                        Черновик сохраняется на этом устройстве. Чем подробнее
                        данные, тем быстрее инженер начнёт работу.
                    </p>
                </div>
                <a href="tel:+73912050505">Срочно? +7 (391) 205-05-05</a>
            </header>
            <div className="wizard-steps" aria-label="Этапы заявки">
                {labels.map((label, index) => (
                    <button
                        className={`${step === index ? 'active' : ''} ${step > index ? 'done' : ''}`}
                        onClick={() => index < step && setStep(index)}
                        disabled={index > step}
                        key={label}
                    >
                        <span>{step > index ? <Check /> : index + 1}</span>
                        <b>{label}</b>
                    </button>
                ))}
            </div>
            <form
                className="service-request-layout"
                onSubmit={(event) => void submit(event)}
                noValidate
            >
                <section className="wizard-panel">
                    {step === 0 && (
                        <>
                            <div className="form-section-title">
                                <span>01</span>
                                <div>
                                    <h2>Кто обращается</h2>
                                    <p>
                                        Эти данные нужны оператору для связи и
                                        документов.
                                    </p>
                                </div>
                            </div>
                            <Select
                                label="Вид сервисной заявки"
                                required
                                value={form.problemType}
                                onChange={(e) => {
                                    const code = e.target.value;
                                    set('problemType', code);
                                    if (code === 'fn_replacement')
                                        set('clientType', 'organization');
                                }}
                                error={errors.problemType}
                                disabled={!serviceTypes.length}
                            >
                                <option value="">
                                    {serviceTypes.length
                                        ? 'Выберите услугу'
                                        : 'Загружаем услуги…'}
                                </option>
                                {serviceTypes.map((item) => (
                                    <option value={item.code} key={item.code}>
                                        {item.title}
                                    </option>
                                ))}
                            </Select>
                            {submitError && (
                                <small className="error-text">
                                    {submitError}
                                </small>
                            )}
                            <div className="segmented">
                                <button
                                    type="button"
                                    className={
                                        form.clientType === 'organization'
                                            ? 'active'
                                            : ''
                                    }
                                    onClick={() =>
                                        set('clientType', 'organization')
                                    }
                                >
                                    Организация или ИП
                                </button>
                                <button
                                    type="button"
                                    className={
                                        form.clientType === 'person'
                                            ? 'active'
                                            : ''
                                    }
                                    onClick={() => set('clientType', 'person')}
                                    disabled={
                                        form.problemType === 'fn_replacement'
                                    }
                                >
                                    Физическое лицо
                                </button>
                            </div>
                            <div className="form-grid">
                                {form.clientType === 'organization' && (
                                    <>
                                        <Input
                                            label="Название организации"
                                            required
                                            value={form.organization}
                                            onChange={(e) =>
                                                set(
                                                    'organization',
                                                    e.target.value,
                                                )
                                            }
                                            error={errors.organization}
                                        />
                                        <Input
                                            label="ИНН"
                                            required
                                            inputMode="numeric"
                                            value={form.inn}
                                            onChange={(e) =>
                                                set(
                                                    'inn',
                                                    e.target.value
                                                        .replace(/\D/g, '')
                                                        .slice(0, 12),
                                                )
                                            }
                                            error={errors.inn}
                                        />
                                    </>
                                )}
                                <Input
                                    label="Контактное лицо"
                                    required
                                    value={form.contactName}
                                    onChange={(e) =>
                                        set('contactName', e.target.value)
                                    }
                                    error={errors.contactName}
                                />
                                <Input
                                    label="Телефон"
                                    required
                                    value={form.phone}
                                    onChange={(e) =>
                                        set('phone', phoneMask(e.target.value))
                                    }
                                    error={errors.phone}
                                />
                                <Input
                                    label="Email"
                                    required
                                    type="email"
                                    value={form.email}
                                    onChange={(e) =>
                                        set('email', e.target.value)
                                    }
                                    error={errors.email}
                                />
                                <Input
                                    label="Город"
                                    required
                                    value={form.city}
                                    onChange={(e) =>
                                        set('city', e.target.value)
                                    }
                                    error={errors.city}
                                />
                                <Input
                                    className="field-span"
                                    label="Адрес оборудования"
                                    value={form.address}
                                    onChange={(e) =>
                                        set('address', e.target.value)
                                    }
                                    hint="Можно заполнить позже, если нужна удалённая помощь"
                                />
                            </div>
                        </>
                    )}
                    {step === 1 && (
                        <>
                            <div className="form-section-title">
                                <span>02</span>
                                <div>
                                    <h2>Оборудование</h2>
                                    <p>
                                        Если точную модель не знаете, так и
                                        напишите.
                                    </p>
                                </div>
                            </div>
                            <div className="form-grid">
                                <Select
                                    label="Тип оборудования"
                                    required
                                    value={form.equipmentType}
                                    onChange={(e) =>
                                        set('equipmentType', e.target.value)
                                    }
                                    error={errors.equipmentType}
                                >
                                    <option>Онлайн-касса</option>
                                    <option>Фискальный регистратор</option>
                                    <option>POS-система</option>
                                    <option>Сканер штрихкодов</option>
                                    <option>Принтер этикеток</option>
                                    <option>Весы</option>
                                    <option>Компьютер или ноутбук</option>
                                    <option>Другое оборудование</option>
                                </Select>
                                <Input
                                    label="Модель"
                                    required
                                    value={form.equipmentModel}
                                    onChange={(e) =>
                                        set('equipmentModel', e.target.value)
                                    }
                                    error={errors.equipmentModel}
                                    placeholder="Например, АТОЛ 30Ф"
                                />
                                <Input
                                    label="Серийный или заводской номер"
                                    value={form.serialNumber}
                                    onChange={(e) =>
                                        set('serialNumber', e.target.value)
                                    }
                                    placeholder="Указан на шильдике"
                                />
                                <Input
                                    label="Используемая программа"
                                    value={form.software}
                                    onChange={(e) =>
                                        set('software', e.target.value)
                                    }
                                    placeholder="1С, Frontol, Эвотор и т. п."
                                />
                                {form.problemType === 'fn_replacement' && (
                                    <Select
                                        label="Срок фискального накопителя"
                                        value={form.fiscalDriveTerm}
                                        onChange={(e) =>
                                            set(
                                                'fiscalDriveTerm',
                                                e.target
                                                    .value as ServiceRequestFormData['fiscalDriveTerm'],
                                            )
                                        }
                                    >
                                        <option value="15">15 месяцев</option>
                                        <option value="36">36 месяцев</option>
                                    </Select>
                                )}
                            </div>
                        </>
                    )}
                    {step === 2 && (
                        <>
                            <div className="form-section-title">
                                <span>03</span>
                                <div>
                                    <h2>Что случилось</h2>
                                    <p>
                                        Опишите симптомы и желаемый результат.
                                    </p>
                                </div>
                            </div>
                            <div className="form-grid">
                                <Select
                                    label="Срочность"
                                    value={form.urgency}
                                    onChange={(e) =>
                                        set(
                                            'urgency',
                                            e.target
                                                .value as ServiceRequestFormData['urgency'],
                                        )
                                    }
                                >
                                    <option value="normal">
                                        Обычная — в рабочее время
                                    </option>
                                    <option value="urgent">
                                        Срочная — сегодня
                                    </option>
                                    <option value="critical">
                                        Критическая — работа остановлена
                                    </option>
                                </Select>
                                <Select
                                    label="Предпочтительный формат"
                                    value={form.helpFormat}
                                    onChange={(e) =>
                                        set(
                                            'helpFormat',
                                            e.target
                                                .value as ServiceRequestFormData['helpFormat'],
                                        )
                                    }
                                >
                                    <option value="remote">Удалённо</option>
                                    <option value="visit">
                                        Выезд специалиста
                                    </option>
                                    <option value="workshop">
                                        Привезу в сервис
                                    </option>
                                </Select>
                                <Textarea
                                    className="field-span"
                                    label="Подробное описание"
                                    required
                                    value={form.description}
                                    onChange={(e) =>
                                        set('description', e.target.value)
                                    }
                                    error={errors.description}
                                    placeholder="Что происходит, когда началась проблема, какие действия уже пробовали?"
                                    rows={6}
                                />
                            </div>
                        </>
                    )}
                    {step === 3 && (
                        <>
                            <div className="form-section-title">
                                <span>04</span>
                                <div>
                                    <h2>Проверьте заявку</h2>
                                    <p>
                                        После отправки данные попадут оператору
                                        сервисного центра.
                                    </p>
                                </div>
                            </div>
                            <dl className="review-list">
                                <div>
                                    <dt>Клиент</dt>
                                    <dd>
                                        {form.organization || form.contactName}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Контакт</dt>
                                    <dd>
                                        {form.contactName}, {form.phone}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Оборудование</dt>
                                    <dd>
                                        {form.equipmentType},{' '}
                                        {form.equipmentModel}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Проблема</dt>
                                    <dd>{problemTitle}</dd>
                                </div>
                                <div>
                                    <dt>Формат</dt>
                                    <dd>
                                        {form.helpFormat === 'remote'
                                            ? 'Удалённо'
                                            : form.helpFormat === 'visit'
                                              ? 'Выезд специалиста'
                                              : 'В сервисном центре'}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Описание</dt>
                                    <dd>{form.description}</dd>
                                </div>
                                {form.problemType === 'fn_replacement' && (
                                    <div>
                                        <dt>Фискальный накопитель</dt>
                                        <dd>{form.fiscalDriveTerm} месяцев</dd>
                                    </div>
                                )}
                            </dl>
                            <label
                                className={`consent ${errors.consent ? 'consent--error' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.consent}
                                    onChange={(e) =>
                                        set('consent', e.target.checked)
                                    }
                                />
                                <span>
                                    Я согласен на обработку персональных данных
                                    для выполнения сервисной заявки.
                                </span>
                            </label>
                            {errors.consent && (
                                <small className="error-text">
                                    {errors.consent}
                                </small>
                            )}
                            {submitError && (
                                <small className="error-text">
                                    {submitError}
                                </small>
                            )}
                        </>
                    )}
                </section>
                <aside className="wizard-aside">
                    <span>Этап {step + 1} из 4</span>
                    <h2>{labels[step]}</h2>
                    <p>
                        {step === 0
                            ? 'Оператор использует контакты только для работы по заявке.'
                            : step === 1
                              ? 'Модель и заводской номер помогут быстрее определить кассу.'
                              : step === 2
                                ? 'Опишите симптомы и желаемый результат.'
                                : 'Проверьте телефон — по нему свяжется специалист.'}
                    </p>
                    <div className="wizard-progress">
                        <i style={{ width: `${(step + 1) * 25}%` }} />
                    </div>
                    <div className="wizard-actions">
                        {step > 0 && (
                            <button
                                type="button"
                                className="button button--secondary"
                                onClick={() => setStep(step - 1)}
                            >
                                <ArrowLeft />
                                Назад
                            </button>
                        )}
                        {step < 3 ? (
                            <Button type="button" onClick={next}>
                                Продолжить <ArrowRight />
                            </Button>
                        ) : (
                            <Button type="submit" disabled={submitting}>
                                {submitting
                                    ? 'Отправляем…'
                                    : 'Отправить заявку'}{' '}
                                <ArrowRight />
                            </Button>
                        )}
                    </div>
                </aside>
            </form>
        </div>
    );
}
