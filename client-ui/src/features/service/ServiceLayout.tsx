import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { SESSION_LOST, ServiceApiError } from './api';
import { ServiceError } from './ui';
import '../../reference/foundation.css';
import './service.css';

export function ServiceLayout() {
    const [menu, setMenu] = useState(false);
    const [lostAt, setLostAt] = useState<string>();
    const location = useLocation();
    const route = useRef(location.key);
    route.current = location.key;
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const lose = () => setLostAt(route.current);
        window.addEventListener(SESSION_LOST, lose);
        return () => window.removeEventListener(SESSION_LOST, lose);
    }, []);
    const close = () => {
        setMenu(false);
        trigger.current?.focus();
    };
    return (
        <div
            className="ui-reference-root ref-client"
            onKeyDown={(event) => {
                if (event.key === 'Escape' && menu) close();
            }}
        >
            <a className="ref-skip" href="#service-content">
                К содержимому
            </a>
            <header className="ref-public-header">
                <div className="ref-public-container">
                    <Link to="/" className="ref-public-brand">
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                            width="155"
                            height="52"
                        />
                    </Link>
                    <nav
                        aria-label="Главная навигация"
                        className="ref-public-nav"
                    >
                        <Link to="/catalog">Оборудование</Link>
                        <NavLink to="/service">Сервис</NavLink>
                        <Link to="/contacts">Контакты</Link>
                    </nav>
                    <Link className="ref-org-link" to="/organizations">
                        Мои организации
                        <ArrowUpRight size={17} />
                    </Link>
                    <button
                        ref={trigger}
                        className="ref-icon-button ref-public-menu-trigger"
                        aria-label={menu ? 'Закрыть меню' : 'Открыть меню'}
                        aria-expanded={menu}
                        aria-controls="service-public-menu"
                        onClick={() => setMenu(!menu)}
                    >
                        {menu ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
                {menu && (
                    <nav
                        id="service-public-menu"
                        aria-label="Мобильная навигация"
                        onClick={close}
                    >
                        <Link to="/catalog">Оборудование</Link>
                        <Link to="/service">Сервис</Link>
                        <Link to="/organizations">Мои организации</Link>
                        <Link to="/contacts">Контакты</Link>
                    </nav>
                )}
            </header>
            <main
                id="service-content"
                className="ref-public-container"
                tabIndex={-1}
            >
                <div className="ref-public-breadcrumb">
                    <Link to="/">Главная</Link>
                    <span>/</span>
                    <Link to="/service">Сервис</Link>
                </div>
                {lostAt === location.key ? (
                    <div className="svc-section">
                        <h1>Доступ к заявкам</h1>
                        <ServiceError
                            error={new ServiceApiError(401, 'SESSION_EXPIRED')}
                        />
                        <Link className="ref-button" to="/service/request">
                            Новое обращение
                        </Link>
                    </div>
                ) : (
                    <Outlet />
                )}
            </main>
            <footer className="ref-public-footer">
                <div className="ref-public-container">
                    <span>VITMA MARKET</span>
                    <span>Кассовое оборудование и сервис</span>
                    <Link to="/privacy">Конфиденциальность</Link>
                </div>
            </footer>
        </div>
    );
}
