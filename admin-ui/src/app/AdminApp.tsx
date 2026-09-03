import { useEffect, useRef, useState } from 'react';
import {
    BrowserRouter,
    Link,
    NavLink,
    Navigate,
    Route,
    Routes,
    useLocation,
} from 'react-router-dom';
import { Bell, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { LegacyAdminSections } from '../legacy/LegacyAdminSections';
import type { Tab } from '../types';
import {
    legacyRoutes,
    unavailableRoutes,
    visibleNavigation,
} from './navigation';
import { SessionProvider, useSession } from './session';
import { Overview, NotificationSettingsPage } from './utility-pages';
import { ServiceQueue } from '../features/service-requests/ServiceQueue';
import { ServiceDetail } from '../features/service-requests/ServiceDetail';
import './foundation.css';
import './admin-shell.css';
import '../features/service-requests/service-workspace.css';

function Navigation({ close }: { close?: () => void }) {
    const { admin } = useSession();
    return (
        <nav aria-label="Разделы админки">
            {visibleNavigation(admin.permissions).map((group) => (
                <section className="admin-nav-group" key={group.title}>
                    <h2>{group.title}</h2>
                    {group.items.map((item) =>
                        unavailableRoutes.has(item.target) ? (
                            <span
                                className="admin-nav-disabled"
                                aria-disabled="true"
                                key={item.target}
                            >
                                <item.icon size={18} />
                                {item.label}
                            </span>
                        ) : (
                            <NavLink
                                key={item.target}
                                to={item.target.replace('/admin', '')}
                                onClick={close}
                            >
                                <item.icon size={18} aria-hidden="true" />
                                {item.label}
                            </NavLink>
                        ),
                    )}
                </section>
            ))}
        </nav>
    );
}
function Shell() {
    const { admin, revision, refresh, logout, notify } = useSession();
    const available = visibleNavigation(admin.permissions)
        .flatMap((group) => group.items)
        .filter((item) => !unavailableRoutes.has(item.target));
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const drawer = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const location = useLocation();
    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);
    useEffect(() => {
        if (!drawerOpen) return;
        const dialog = drawer.current;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog?.showModal();
        const media = window.matchMedia('(min-width: 1024px)');
        const close = () => {
            if (media.matches) setDrawerOpen(false);
        };
        media.addEventListener('change', close);
        return () => {
            dialog?.close();
            document.body.style.overflow = overflow;
            media.removeEventListener('change', close);
            trigger.current?.focus();
        };
    }, [drawerOpen]);
    async function signOut() {
        setLoggingOut(true);
        try {
            await logout();
        } catch {
            notify('Не удалось выйти. Повторите попытку.');
        } finally {
            setLoggingOut(false);
        }
    }
    const allowed = (path: string) =>
        available.some((item) => item.target === `/admin${path}`);
    const first =
        available[0]?.target.replace('/admin', '') || '/settings/notifications';
    const section = available.find(
        (item) =>
            location.pathname === item.target.replace('/admin', '') ||
            location.pathname.startsWith(
                `${item.target.replace('/admin', '')}/`,
            ),
    );
    return (
        <>
            <a className="admin-skip" href="#admin-main">
                К содержимому
            </a>
            <aside className="admin-sidebar">
                <Link to={first} className="admin-brand">
                    VITMA <span>MARKET</span>
                </Link>
                <Navigation />
            </aside>
            <dialog
                className="admin-drawer"
                ref={drawer}
                aria-label="Навигация"
                onCancel={() => setDrawerOpen(false)}
                onClick={(e) => {
                    if (e.target === e.currentTarget) setDrawerOpen(false);
                }}
            >
                <div>
                    <header>
                        <strong>VITMA MARKET</strong>
                        <button
                            className="admin-icon-button"
                            aria-label="Закрыть навигацию"
                            onClick={() => setDrawerOpen(false)}
                        >
                            <X size={20} />
                        </button>
                    </header>
                    <Navigation close={() => setDrawerOpen(false)} />
                </div>
            </dialog>
            <div className="admin-workspace">
                <header className="admin-utility">
                    <button
                        ref={trigger}
                        className="admin-icon-button admin-nav-trigger"
                        aria-label="Открыть навигацию"
                        aria-expanded={drawerOpen}
                        onClick={() => setDrawerOpen(true)}
                    >
                        <Menu size={20} />
                    </button>
                    <span className="admin-utility-title">
                        {section?.label || 'Рабочее пространство'}
                    </span>
                    <div className="admin-utility-actions">
                        <button
                            className="admin-icon-button"
                            title="Обновить данные"
                            aria-label="Обновить данные"
                            onClick={refresh}
                        >
                            <RefreshCw size={18} />
                        </button>
                        <Link
                            className="admin-icon-button"
                            to="/settings/notifications"
                            title="Уведомления"
                            aria-label="Уведомления"
                        >
                            <Bell size={18} />
                        </Link>
                        <span className="admin-employee">
                            {admin.displayName}
                        </span>
                        <button
                            className="admin-icon-button"
                            title="Выйти"
                            aria-label="Выйти"
                            disabled={loggingOut}
                            onClick={() => void signOut()}
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>
                <main id="admin-main" className="admin-main">
                    <Routes>
                        <Route
                            path="/"
                            element={<Navigate to={first} replace />}
                        />
                        <Route
                            path="work"
                            element={
                                allowed('/work') ? <Overview /> : <Forbidden />
                            }
                        />
                        <Route
                            path="requests/service"
                            element={
                                allowed('/requests/service') ? (
                                    <ServiceQueue />
                                ) : (
                                    <Forbidden />
                                )
                            }
                        />
                        <Route
                            path="requests/service/:id"
                            element={
                                allowed('/requests/service') ? (
                                    <ServiceDetail />
                                ) : (
                                    <Forbidden />
                                )
                            }
                        />
                        {Object.entries(legacyRoutes).map(([tab, path]) => (
                            <Route
                                key={path}
                                path={path}
                                element={
                                    allowed(path) ? (
                                        <LegacyAdminSections
                                            key={`${tab}:${admin.permissions.join(',')}`}
                                            admin={admin}
                                            tab={tab as Tab}
                                            refreshKey={revision}
                                            onChanged={refresh}
                                        />
                                    ) : (
                                        <Forbidden />
                                    )
                                }
                            />
                        ))}
                        <Route
                            path="settings/notifications"
                            element={<NotificationSettingsPage />}
                        />
                        <Route
                            path="*"
                            element={
                                <div className="admin-state">
                                    <h1>Страница не найдена</h1>
                                    <Link className="admin-button" to={first}>
                                        К рабочему пространству
                                    </Link>
                                </div>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </>
    );
}
function Forbidden() {
    return (
        <div className="admin-state" role="alert">
            <h1>Нет доступа к разделу</h1>
            <p>Обратитесь к администратору.</p>
        </div>
    );
}
export function AdminApp() {
    return (
        <div className="vitma-admin-app">
            <BrowserRouter basename="/admin">
                <SessionProvider>
                    <Shell />
                </SessionProvider>
            </BrowserRouter>
        </div>
    );
}
