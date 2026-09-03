import { useEffect, useRef, useState } from 'react';
import {
    BrowserRouter,
    Link,
    Route,
    Routes,
    useLocation,
} from 'react-router-dom';
import { Bell, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { post } from '../api';
import type { Admin, NotificationSettings, Staff } from '../types';
import { visibleNavigation } from './navigation';
import { ReadState } from './primitives';
import { useRead } from './use-read';
import { canReadService } from './service/service-reference-model';
import { ServiceQueueReference } from './service/ServiceQueueReference';
import { ServiceDetailReference } from './service/ServiceDetailReference';
import '../../../client-ui/src/reference/foundation.css';
import './reference-admin.css';

function Navigation({ admin, close }: { admin: Admin; close?: () => void }) {
    return (
        <nav aria-label="Разделы админки">
            {visibleNavigation(admin.permissions).map((group) => (
                <section className="ref-nav-group" key={group.title}>
                    <h2>{group.title}</h2>
                    {group.items.map((item) =>
                        'reference' in item ? (
                            <Link
                                key={item.target}
                                to={item.reference!}
                                aria-current="page"
                                onClick={close}
                            >
                                <item.icon size={18} aria-hidden="true" />
                                {item.label}
                            </Link>
                        ) : (
                            <button
                                key={item.target}
                                type="button"
                                aria-disabled="true"
                                title="Раздел не входит в этот эталонный срез"
                            >
                                <item.icon size={18} aria-hidden="true" />
                                {item.label}
                            </button>
                        ),
                    )}
                </section>
            ))}
        </nav>
    );
}

function NotificationReadout() {
    const result = useRead<NotificationSettings>(
        '/admin/api/notification-bindings',
    );
    if (!result.data) return <ReadState {...result} />;
    return (
        <div className="ref-notifications">
            <h2>Уведомления</h2>
            {(
                [
                    ['Регистрации', result.data.notifyRegistrations],
                    ['Вопросы', result.data.notifyTickets],
                    ['Сервис', result.data.notifyServiceRequests],
                ] as const
            ).map(([label, enabled]) => (
                <p key={label}>
                    {label}
                    <strong>{enabled ? 'Включены' : 'Выключены'}</strong>
                </p>
            ))}
            <small>Изменение настроек доступно в обычной админке.</small>
        </div>
    );
}

function Workspace({
    admin,
    onLogout,
}: {
    admin: Admin;
    onLogout: () => void;
}) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [logoutError, setLogoutError] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const drawer = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const location = useLocation();
    const staff = useRead<Staff[]>(
        admin.permissions.includes('staff.read')
            ? '/admin/api/staff/engineers'
            : null,
        refreshKey,
    );

    useEffect(() => {
        if (!drawerOpen) return;
        const dialog = drawer.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog?.showModal();
        const wide = window.matchMedia('(min-width: 1024px)');
        const closeOnDesktop = () => {
            if (wide.matches) setDrawerOpen(false);
        };
        wide.addEventListener('change', closeOnDesktop);
        return () => {
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            wide.removeEventListener('change', closeOnDesktop);
            trigger.current?.focus();
        };
    }, [drawerOpen]);
    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

    async function logout() {
        setLoggingOut(true);
        setLogoutError(false);
        try {
            await post('/admin/api/logout');
            onLogout();
        } catch {
            setLogoutError(true);
        } finally {
            setLoggingOut(false);
        }
    }
    return (
        <>
            <a className="ref-skip" href="#reference-main">
                К содержимому
            </a>
            <aside className="ref-sidebar">
                <a href="/admin/" className="ref-brand">
                    VITMA <span>MARKET</span>
                </a>
                <Navigation admin={admin} />
                <span className="ref-preview-label">
                    FE-1A · эталон интерфейса
                </span>
            </aside>
            <dialog
                className="ref-drawer"
                ref={drawer}
                aria-label="Навигация"
                onCancel={() => setDrawerOpen(false)}
                onClick={(event) => {
                    if (event.target === event.currentTarget)
                        setDrawerOpen(false);
                }}
            >
                <div>
                    <header>
                        <strong>VITMA MARKET</strong>
                        <button
                            className="ref-icon-button"
                            aria-label="Закрыть навигацию"
                            onClick={() => setDrawerOpen(false)}
                        >
                            <X size={20} />
                        </button>
                    </header>
                    <Navigation
                        admin={admin}
                        close={() => setDrawerOpen(false)}
                    />
                </div>
            </dialog>
            <div className="ref-workspace">
                <header className="ref-utility">
                    <button
                        ref={trigger}
                        className="ref-icon-button ref-nav-trigger"
                        aria-label="Открыть навигацию"
                        aria-expanded={drawerOpen}
                        onClick={() => setDrawerOpen(true)}
                    >
                        <Menu size={20} />
                    </button>
                    <span className="ref-utility-title">
                        Рабочее пространство
                    </span>
                    <div className="ref-utility-actions">
                        <button
                            className="ref-icon-button"
                            aria-label="Обновить данные"
                            title="Обновить данные"
                            onClick={() => setRefreshKey((key) => key + 1)}
                        >
                            <RefreshCw size={18} />
                        </button>
                        <button
                            className="ref-icon-button"
                            aria-label="Уведомления"
                            title="Уведомления"
                            aria-expanded={notificationsOpen}
                            onClick={() =>
                                setNotificationsOpen((open) => !open)
                            }
                        >
                            <Bell size={18} />
                        </button>
                        <span className="ref-employee">
                            {admin.displayName}
                        </span>
                        <button
                            className="ref-icon-button"
                            title="Выйти"
                            aria-label="Выйти"
                            disabled={loggingOut}
                            onClick={() => void logout()}
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>
                {notificationsOpen && (
                    <section
                        className="ref-notification-area"
                        aria-label="Настройки уведомлений"
                    >
                        <NotificationReadout />
                    </section>
                )}
                {logoutError && (
                    <p className="ref-notice" role="alert">
                        Не удалось выйти. Повторите попытку.
                    </p>
                )}
                {Boolean(staff.error) && (
                    <p className="ref-notice">
                        Имена исполнителей недоступны. Указаны номера
                        сотрудников.{' '}
                        <button className="ref-button" onClick={staff.retry}>
                            Повторить
                        </button>
                    </p>
                )}
                <main id="reference-main" className="ref-main">
                    {canReadService(admin) ? (
                        <Routes>
                            <Route
                                path="service-requests"
                                element={
                                    <ServiceQueueReference
                                        admin={admin}
                                        staff={staff.data || []}
                                        refreshKey={refreshKey}
                                    />
                                }
                            />
                            <Route
                                path="service-requests/:id"
                                element={
                                    <ServiceDetailReference
                                        admin={admin}
                                        staff={staff.data || []}
                                        refreshKey={refreshKey}
                                    />
                                }
                            />
                            <Route
                                path="*"
                                element={
                                    <div className="ref-state">
                                        <h1>Страница не найдена</h1>
                                        <Link to="/service-requests">
                                            К сервисным заявкам
                                        </Link>
                                    </div>
                                }
                            />
                        </Routes>
                    ) : (
                        <div className="ref-state" role="alert">
                            <h1>Нет доступа к сервисным заявкам</h1>
                            <p>
                                Обратитесь к администратору за доступом к этому
                                разделу.
                            </p>
                            <a className="ref-button" href="/admin/">
                                В обычную админку
                            </a>
                        </div>
                    )}
                </main>
            </div>
        </>
    );
}

export default function ReferenceAdminApp() {
    const session = useRead<{ admin: Admin }>('/admin/api/me');
    const [expired, setExpired] = useState(false);
    useEffect(() => {
        const expire = () => setExpired(true);
        window.addEventListener('vitma:unauthorized', expire);
        return () => window.removeEventListener('vitma:unauthorized', expire);
    }, []);
    const retry = () => {
        setExpired(false);
        session.retry();
    };
    return (
        <div className="ui-reference-root ref-admin">
            {expired ? (
                <div className="ref-state">
                    <h1>Сессия завершена</h1>
                    <p>
                        Войдите через обычную админку и вернитесь к этому
                        адресу.
                    </p>
                    <div className="ref-actions">
                        <a
                            className="ref-button ref-button--primary"
                            href="/admin/"
                        >
                            Войти в админку
                        </a>
                        <button className="ref-button" onClick={retry}>
                            Проверить вход
                        </button>
                    </div>
                </div>
            ) : !session.data ? (
                <ReadState {...session} retry={retry} />
            ) : (
                <BrowserRouter basename="/admin/reference">
                    <Workspace
                        admin={session.data.admin}
                        onLogout={() => setExpired(true)}
                    />
                </BrowserRouter>
            )}
        </div>
    );
}
