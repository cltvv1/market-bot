import { Check, Circle, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, EmptyState, Input, Loader } from '../components/ui';
import { serviceRequestService } from '../services/client';
import type { ServiceRequestRecord } from '../types';

const statusLabels = {
    accepted: 'Заявка принята',
    assigned: 'Назначен специалист',
    diagnostics: 'Проводится диагностика',
    waiting: 'Ожидается информация или запчасть',
    completed: 'Работа выполнена',
    closed: 'Заявка закрыта',
};

export function ServiceStatusPage() {
    const [params, setParams] = useSearchParams();
    const [number, setNumber] = useState(params.get('number') || '');
    const [result, setResult] = useState<
        ServiceRequestRecord | null | undefined
    >(undefined);
    const [loading, setLoading] = useState(false);
    const search = async (value = number) => {
        if (!value.trim()) return;
        setLoading(true);
        setParams({ number: value.trim() }, { replace: true });
        setResult(await serviceRequestService.find(value));
        setLoading(false);
    };
    useEffect(() => {
        const initial = params.get('number');
        if (initial) void search(initial);
    }, []);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void search();
    };
    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Сервисный центр', to: '/service' },
                    { label: 'Статус заявки' },
                ]}
            />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Контроль заявки</span>
                    <h1>Проверить статус</h1>
                    <p>
                        Введите номер из подтверждения. Для демонстрации можно
                        использовать SR-240721-1042.
                    </p>
                </div>
            </header>
            <form className="status-search" onSubmit={submit}>
                <Input
                    label="Номер сервисной заявки"
                    value={number}
                    onChange={(e) => setNumber(e.target.value.toUpperCase())}
                    placeholder="SR-240721-1042"
                />
                <Button type="submit">
                    <Search />
                    Найти заявку
                </Button>
            </form>
            {loading ? (
                <Loader label="Ищем заявку" />
            ) : result === null ? (
                <EmptyState
                    icon={<Search />}
                    title="Заявка не найдена"
                    text="Проверьте номер или свяжитесь с сервисным центром."
                />
            ) : result ? (
                <section className="request-status">
                    <header>
                        <div>
                            <span>{result.number}</span>
                            <h2>{result.title}</h2>
                            <p>
                                Создана {result.createdAt} ·{' '}
                                {result.contactName}
                            </p>
                        </div>
                        <strong>{statusLabels[result.status]}</strong>
                    </header>
                    <ol>
                        {result.history.map((event) => (
                            <li
                                className="done"
                                key={`${event.status}-${event.date}`}
                            >
                                <span>
                                    <Check />
                                </span>
                                <div>
                                    <h3>{event.title}</h3>
                                    <time>{event.date}</time>
                                    {event.note && <p>{event.note}</p>}
                                </div>
                            </li>
                        ))}
                        {result.status !== 'closed' &&
                            result.status !== 'completed' && (
                                <li>
                                    <span>
                                        <Circle />
                                    </span>
                                    <div>
                                        <h3>Следующий этап</h3>
                                        <p>
                                            Информация появится после обновления
                                            заявки оператором.
                                        </p>
                                    </div>
                                </li>
                            )}
                    </ol>
                </section>
            ) : (
                <div className="status-hint">
                    <Search />
                    <div>
                        <h2>Номер указан в сообщении после отправки</h2>
                        <p>
                            Статус показывает текущий этап, назначенного
                            специалиста и комментарии сервиса.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
