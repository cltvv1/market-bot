import {
    Menu,
    Search,
    ShoppingCart,
    X,
    Phone,
    Mail,
    MapPin,
    ArrowUpRight,
    PhoneCall,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    Link,
    NavLink,
    Outlet,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import { company } from '../data/company';
import { useCart } from '../context/CartContext';
import { useCallbackRequest } from '../context/CallbackContext';

const nav = [
    { to: '/catalog', label: 'Каталог' },
    { to: '/solutions', label: 'Автоматизация' },
    { to: '/service', label: 'Сервис' },
    { to: '/about', label: 'О компании' },
    { to: '/delivery', label: 'Доставка и оплата' },
    { to: '/contacts', label: 'Контакты' },
];

export function Layout() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { count, notice } = useCart();
    const { openCallback } = useCallbackRequest();
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        setMenuOpen(false);
        if (location.hash) {
            window.requestAnimationFrame(() =>
                document
                    .getElementById(location.hash.slice(1))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            );
            return;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [location.hash, location.pathname]);
    useEffect(() => {
        const titles: Record<string, string> = {
            '/': 'VITMA MARKET — кассовое оборудование и сервис',
            '/catalog': 'Каталог оборудования — VITMA MARKET',
            '/search': 'Поиск по товарам и услугам — VITMA MARKET',
            '/solutions': 'Автоматизация бизнеса — VITMA MARKET',
            '/cart': 'Корзина — VITMA MARKET',
            '/checkout': 'Оформление заказа — VITMA MARKET',
            '/service': 'Сервисный центр — VITMA MARKET',
            '/service/request': 'Сервисная заявка — VITMA MARKET',
            '/service/status': 'Статус заявки — VITMA MARKET',
            '/cash-registration': 'Регистрация кассы — VITMA MARKET',
            '/about': 'О компании — VITMA MARKET',
            '/delivery': 'Доставка и оплата — VITMA MARKET',
            '/warranty': 'Гарантия и возврат — VITMA MARKET',
            '/contacts': 'Контакты — VITMA MARKET',
        };
        document.title =
            titles[location.pathname] ||
            (location.pathname.startsWith('/catalog/')
                ? 'Товар — VITMA MARKET'
                : 'VITMA MARKET');
    }, [location.pathname]);
    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        if (!query.trim()) return;
        void navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    };

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main">
                Перейти к содержимому
            </a>
            <header className="site-header">
                <div className="topline">
                    <div className="container">
                        <span>Кассовое оборудование и сервис для бизнеса</span>
                        <div>
                            <a href={company.phoneHref}>{company.phone}</a>
                            <span>{company.schedule.split(',')[0]}</span>
                            <button
                                type="button"
                                onClick={() => openCallback()}
                            >
                                Заказать звонок
                            </button>
                        </div>
                    </div>
                </div>
                <div className="header-main container">
                    <Link
                        className="logo"
                        to="/"
                        aria-label="VITMA MARKET — главная"
                    >
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                        />
                    </Link>
                    <form
                        className="header-search"
                        role="search"
                        onSubmit={submitSearch}
                    >
                        <Search size={19} />
                        <input
                            aria-label="Поиск по товарам и услугам"
                            placeholder="Найти товар или услугу"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <button type="submit">Найти</button>
                    </form>
                    <Link
                        className="cart-link"
                        to="/cart"
                        aria-label={`Корзина, товаров: ${count}`}
                    >
                        <ShoppingCart />
                        <span>Корзина</span>
                        {count > 0 && <b>{count}</b>}
                    </Link>
                    <button
                        className="menu-toggle"
                        onClick={() => setMenuOpen((value) => !value)}
                        aria-expanded={menuOpen}
                        aria-label="Открыть меню"
                    >
                        {menuOpen ? <X /> : <Menu />}
                    </button>
                </div>
                <nav
                    className={`main-nav ${menuOpen ? 'main-nav--open' : ''}`}
                    aria-label="Основная навигация"
                >
                    <div className="container">
                        {nav.map((item) => (
                            <NavLink key={item.to} to={item.to}>
                                {item.label}
                            </NavLink>
                        ))}
                        <NavLink className="service-cta" to="/service/request">
                            Оставить заявку <ArrowUpRight size={16} />
                        </NavLink>
                    </div>
                </nav>
            </header>
            <main id="main">
                <Outlet />
            </main>
            <footer className="site-footer">
                <div className="container footer-grid">
                    <div className="footer-brand">
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                        />
                        <p>
                            Оборудование, автоматизация и техническая поддержка
                            бизнеса в одном месте.
                        </p>
                    </div>
                    <div>
                        <h2>Покупателям</h2>
                        <Link to="/catalog">Каталог</Link>
                        <Link to="/solutions">Автоматизация</Link>
                        <Link to="/delivery">Доставка и оплата</Link>
                        <Link to="/warranty">Гарантия и возврат</Link>
                        <Link to="/cart">Корзина</Link>
                    </div>
                    <div>
                        <h2>Сервис</h2>
                        <Link to="/service">Направления сервиса</Link>
                        <Link to="/service/request">Оставить заявку</Link>
                        <Link to="/cash-registration">Регистрация кассы</Link>
                        <Link to="/service/status">Проверить статус</Link>
                        <Link to="/contacts">Контакты</Link>
                    </div>
                    <div className="footer-contacts">
                        <h2>Связаться</h2>
                        <a href={company.phoneHref}>
                            <Phone size={17} />
                            {company.phone}
                        </a>
                        <a href={company.emailHref}>
                            <Mail size={17} />
                            {company.email}
                        </a>
                        <span>
                            <MapPin size={17} />
                            {company.address}
                        </span>
                    </div>
                </div>
                <div className="container footer-bottom">
                    <span>© 2026 VITMA MARKET</span>
                    <span>
                        {company.legalName} · ИНН {company.inn}
                    </span>
                    <Link to="/privacy">Политика обработки данных</Link>
                </div>
                <div className="container footer-disclaimer">
                    Информация о товарах и ценах носит ознакомительный характер
                    и не является публичной офертой. Итоговую стоимость и
                    наличие подтверждает менеджер.
                </div>
            </footer>
            <button
                className="callback-fab"
                type="button"
                onClick={() => openCallback()}
                aria-label="Заказать обратный звонок"
            >
                <PhoneCall />
                <span>Нужна консультация</span>
            </button>
            <div
                className={`toast ${notice ? 'toast--visible' : ''}`}
                role="status"
            >
                {notice}
            </div>
        </div>
    );
}
