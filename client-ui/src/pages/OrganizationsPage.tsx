import {
    Building2,
    CheckCircle2,
    Clock3,
    RotateCw,
    Send,
    XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge, Button, Input, Loader, Textarea } from '../components/ui';
import { organizationAccessService } from '../services/client';
import type {
    OrganizationAccessFormData,
    OrganizationAccessRequest,
    OrganizationAccessStatus,
    OrganizationMembership,
} from '../types';

const emptyForm: OrganizationAccessFormData = {
    organizationName: '',
    inn: '',
    kpp: '',
    name: '',
    phone: '',
    email: '',
    comment: '',
};

const statusInfo: Record<
    OrganizationAccessStatus,
    { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
    pending: { label: 'На проверке', tone: 'warning' },
    approved: { label: 'Одобрен', tone: 'success' },
    rejected: { label: 'Отклонён', tone: 'danger' },
    cancelled: { label: 'Отозван', tone: 'neutral' },
};

const formatDate = (value: string) =>
    new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export function OrganizationsPage() {
    const [form, setForm] = useState(emptyForm);
    const [organizations, setOrganizations] = useState<
        OrganizationMembership[]
    >([]);
    const [requests, setRequests] = useState<OrganizationAccessRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [cancellingId, setCancellingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [memberships, accessRequests] = await Promise.all([
                organizationAccessService.listOrganizations(),
                organizationAccessService.listRequests(),
            ]);
            setOrganizations(memberships);
            setRequests(accessRequests);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : 'Не удалось загрузить организации',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const change = (field: keyof OrganizationAccessFormData, value: string) =>
        setForm((current) => ({ ...current, [field]: value }));

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const inn = form.inn.replace(/\D/g, '');
        const kpp = form.kpp.replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) {
            setError('ИНН должен содержать 10 или 12 цифр.');
            return;
        }
        if (kpp && kpp.length !== 9) {
            setError('КПП должен содержать 9 цифр.');
            return;
        }
        setSubmitting(true);
        setError('');
        setNotice('');
        try {
            await organizationAccessService.submit(form);
            setForm(emptyForm);
            setNotice('Запрос отправлен оператору на проверку.');
            await load();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Не удалось отправить запрос',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const cancel = async (id: number) => {
        setCancellingId(id);
        setError('');
        try {
            await organizationAccessService.cancel(id);
            setNotice('Запрос отозван.');
            await load();
        } catch (cancelError) {
            setError(
                cancelError instanceof Error
                    ? cancelError.message
                    : 'Не удалось отозвать запрос',
            );
        } finally {
            setCancellingId(null);
        }
    };

    return (
        <div className="page container organizations-page">
            <Breadcrumbs items={[{ label: 'Мои организации' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Кабинет клиента</span>
                    <h1>Мои организации</h1>
                    <p>
                        Запросите доступ по ИНН. После проверки оператором здесь
                        появятся организация, кассы и связанные услуги.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => void load()}>
                    <RotateCw size={17} />
                    Обновить
                </Button>
            </header>

            {loading ? (
                <Loader label="Загружаем организации" />
            ) : (
                <div className="organizations-layout">
                    <section className="organization-access-form">
                        <header>
                            <Building2 />
                            <div>
                                <h2>Запросить доступ</h2>
                                <p>
                                    Оператор сверит данные и подтвердит, что вы
                                    представляете эту организацию.
                                </p>
                            </div>
                        </header>
                        <form onSubmit={(event) => void submit(event)}>
                            <div className="form-grid">
                                <Input
                                    label="Название организации"
                                    value={form.organizationName}
                                    onChange={(event) =>
                                        change(
                                            'organizationName',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="ООО Витма"
                                />
                                <Input
                                    label="ИНН"
                                    required
                                    inputMode="numeric"
                                    value={form.inn}
                                    onChange={(event) =>
                                        change('inn', event.target.value)
                                    }
                                    placeholder="10 или 12 цифр"
                                />
                                <Input
                                    label="КПП"
                                    inputMode="numeric"
                                    value={form.kpp}
                                    onChange={(event) =>
                                        change('kpp', event.target.value)
                                    }
                                    placeholder="Для юридического лица"
                                />
                                <Input
                                    label="Ваше имя"
                                    value={form.name}
                                    onChange={(event) =>
                                        change('name', event.target.value)
                                    }
                                />
                                <Input
                                    label="Телефон"
                                    type="tel"
                                    value={form.phone}
                                    onChange={(event) =>
                                        change('phone', event.target.value)
                                    }
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    value={form.email}
                                    onChange={(event) =>
                                        change('email', event.target.value)
                                    }
                                />
                                <Textarea
                                    className="field-span"
                                    label="Комментарий"
                                    value={form.comment}
                                    onChange={(event) =>
                                        change('comment', event.target.value)
                                    }
                                    placeholder="Например, ваша должность или удобное время для связи"
                                />
                            </div>
                            {error && (
                                <p className="form-error" role="alert">
                                    {error}
                                </p>
                            )}
                            {notice && (
                                <p className="form-success" role="status">
                                    {notice}
                                </p>
                            )}
                            <Button type="submit" disabled={submitting}>
                                <Send size={17} />
                                {submitting
                                    ? 'Отправляем…'
                                    : 'Отправить запрос'}
                            </Button>
                        </form>
                    </section>

                    <div className="organization-access-results">
                        <section>
                            <h2>Доступные организации</h2>
                            {organizations.length ? (
                                <div className="organization-list">
                                    {organizations.map((membership) => (
                                        <article key={membership.id}>
                                            <CheckCircle2 />
                                            <div>
                                                <strong>
                                                    {membership.organization
                                                        .name || 'Организация'}
                                                </strong>
                                                <span>
                                                    ИНН{' '}
                                                    {
                                                        membership.organization
                                                            .inn
                                                    }
                                                    {membership.organization.kpp
                                                        ? ` · КПП ${membership.organization.kpp}`
                                                        : ''}
                                                </span>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <p className="empty-copy">
                                    Подтверждённых организаций пока нет.
                                </p>
                            )}
                        </section>

                        <section>
                            <h2>История запросов</h2>
                            {requests.length ? (
                                <div className="access-request-list">
                                    {requests.map((request) => {
                                        const status =
                                            statusInfo[request.status];
                                        return (
                                            <article key={request.id}>
                                                <div>
                                                    {request.status ===
                                                    'approved' ? (
                                                        <CheckCircle2 />
                                                    ) : request.status ===
                                                      'pending' ? (
                                                        <Clock3 />
                                                    ) : (
                                                        <XCircle />
                                                    )}
                                                    <div>
                                                        <strong>
                                                            {request
                                                                .organization
                                                                .name ||
                                                                'Организация'}
                                                        </strong>
                                                        <span>
                                                            ИНН{' '}
                                                            {
                                                                request
                                                                    .organization
                                                                    .inn
                                                            }{' '}
                                                            ·{' '}
                                                            {formatDate(
                                                                request.createdAt,
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <Badge tone={status.tone}>
                                                        {status.label}
                                                    </Badge>
                                                    {request.status ===
                                                        'pending' && (
                                                        <Button
                                                            variant="ghost"
                                                            disabled={
                                                                cancellingId ===
                                                                request.id
                                                            }
                                                            onClick={() =>
                                                                void cancel(
                                                                    request.id,
                                                                )
                                                            }
                                                        >
                                                            Отозвать
                                                        </Button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="empty-copy">
                                    Запросов на доступ пока нет.
                                </p>
                            )}
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
