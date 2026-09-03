import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Link2 } from 'lucide-react';
import { post } from '../api';
import type { NotificationSettings, Summary } from '../types';
import { useRead } from './use-read';
import { ReadState } from './primitives';
import { useSession } from './session';

export function Overview() {
    const { admin, revision } = useSession();
    const result = useRead<Summary>('/admin/api/summary', revision);
    if (!result.data) return <ReadState {...result} />;
    const rows = [
        {
            label: 'Новые регистрации',
            value: result.data.newRegistrations,
            to: '/requests/registrations',
            permissions: ['registrations.read'],
        },
        {
            label: 'Активные сервисные заявки',
            value: result.data.activeServiceRequests,
            to: '/requests/service',
            permissions: [
                'serviceRequests.read.all',
                'serviceRequests.read.assigned',
            ],
        },
        {
            label: 'Открытые вопросы',
            value: result.data.openTickets,
            to: '/requests/tickets',
            permissions: ['tickets.read'],
        },
    ];
    return (
        <>
            <header className="admin-page-heading">
                <div>
                    <h1>Моя работа</h1>
                    <p>Сводка по доступным очередям</p>
                </div>
            </header>
            <div className="admin-overview">
                {rows
                    .filter((row) =>
                        row.permissions.some((p) =>
                            admin.permissions.includes(p),
                        ),
                    )
                    .map((row) => (
                        <Link key={row.to} to={row.to}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                            <ArrowRight size={20} />
                        </Link>
                    ))}
            </div>
        </>
    );
}
export function NotificationSettingsPage() {
    const { revision, notify } = useSession();
    const result = useRead<NotificationSettings>(
        '/admin/api/notification-bindings',
        revision,
    );
    const [busy, setBusy] = useState(false);
    const settings = result.data;
    async function toggle(key: keyof NotificationSettings) {
        if (!settings || busy) return;
        setBusy(true);
        try {
            await post('/admin/api/notification-bindings/settings', {
                ...settings,
                [key]: !settings[key],
            });
            result.retry();
        } catch {
            notify('Не удалось сохранить настройки.');
        } finally {
            setBusy(false);
        }
    }
    async function bind(platform: 'telegram' | 'max') {
        setBusy(true);
        try {
            const value = await post<{ command: string }>(
                '/admin/api/notification-bindings/code',
                { platform },
            );
            notify(
                `Отправьте боту ${value.command} в ${platform === 'max' ? 'MAX' : 'Telegram'}`,
            );
        } catch {
            notify('Не удалось создать код привязки.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <header className="admin-page-heading">
                <h1>Уведомления</h1>
            </header>
            {!settings ? (
                <ReadState {...result} />
            ) : (
                <section className="admin-form admin-settings">
                    {(
                        [
                            ['notifyRegistrations', 'Регистрации ККТ'],
                            ['notifyTickets', 'Вопросы клиентов'],
                            ['notifyServiceRequests', 'Сервисные заявки'],
                        ] as const
                    ).map(([key, label]) => (
                        <label className="admin-check" key={key}>
                            <input
                                type="checkbox"
                                checked={settings[key]}
                                disabled={busy || result.loading}
                                onChange={() => void toggle(key)}
                            />
                            {label}
                        </label>
                    ))}
                    <div className="admin-actions">
                        <button
                            className="admin-button"
                            disabled={busy}
                            onClick={() => void bind('telegram')}
                        >
                            <Link2 size={16} />
                            Код Telegram
                        </button>
                        <button
                            className="admin-button"
                            disabled={busy}
                            onClick={() => void bind('max')}
                        >
                            <Link2 size={16} />
                            Код MAX
                        </button>
                    </div>
                </section>
            )}
        </>
    );
}
