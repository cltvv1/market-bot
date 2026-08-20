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
    Clock3,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import styles from './Layout.module.css';

const nav = [
    { to: '/catalog', label: 'Каталог' },
    { to: '/solutions', label: 'Автоматизация' },
    { to: '/service', label: 'Сервис' },
    { to: '/organizations', label: 'Мои организации' },
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
    const menuButtonRef = useRef<HTMLButtonElement>(null);
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
        if (!menuOpen) return;
        const previousOverflow = document.body.style.overflow;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setMenuOpen(false);
            menuButtonRef.current?.focus();
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);
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
            '/organizations': 'Мои организации — VITMA MARKET',
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
        <div className={styles.shell}>
            <a className="skip-link" href="#main">
                Перейти к содержимому
            </a>
            <header className={styles.header}>
                <div className={styles.utility}>
                    <div className={`container ${styles.utilityInner}`}>
                        <span>Кассовое оборудование и сервис для бизнеса</span>
                        <div className={styles.utilityLinks}>
                            <span>
                                <MapPin size={14} aria-hidden="true" />
                                Красноярск
                            </span>
                            <a href={company.phoneHref}>
                                <Phone size={14} aria-hidden="true" />
                                {company.phone}
                            </a>
                            <span className={styles.schedule}>
                                <Clock3 size={14} aria-hidden="true" />
                                {company.schedule.split(',')[0]}
                            </span>
                        </div>
                    </div>
                </div>
                <div className={`container ${styles.brandRow}`}>
                    <Link
                        className={styles.logo}
                        to="/"
                        aria-label="VITMA MARKET — главная"
                    >
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                        />
                    </Link>
                    <form
                        className={styles.search}
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
                        className={styles.cart}
                        to="/cart"
                        aria-label={`Корзина, товаров: ${count}`}
                    >
                        <ShoppingCart />
                        <span>Корзина</span>
                        {count > 0 && (
                            <b className={styles.cartCount}>{count}</b>
                        )}
                    </Link>
                    <button
                        ref={menuButtonRef}
                        className={styles.menuToggle}
                        onClick={() => setMenuOpen((value) => !value)}
                        aria-expanded={menuOpen}
                        aria-controls="site-navigation"
                        aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
                    >
                        {menuOpen ? <X /> : <Menu />}
                    </button>
                </div>
                {menuOpen && (
                    <button
                        className={styles.backdrop}
                        type="button"
                        aria-label="Закрыть меню"
                        onClick={() => setMenuOpen(false)}
                    />
                )}
                <nav
                    id="site-navigation"
                    className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`}
                    aria-label="Основная навигация"
                >
                    <div className={`container ${styles.navInner}`}>
                        {nav.map((item) => (
                            <NavLink
                                className={({ isActive }) =>
                                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                                }
                                key={item.to}
                                to={item.to}
                            >
                                {item.label}
                            </NavLink>
                        ))}
                        <NavLink
                            className={styles.serviceCta}
                            to="/service/request"
                        >
                            Оставить заявку <ArrowUpRight size={16} />
                        </NavLink>
                    </div>
                </nav>
            </header>
            <main className={styles.main} id="main">
                <Outlet />
            </main>
            <footer className={styles.footer}>
                <div className={`container ${styles.footerGrid}`}>
                    <div className={styles.footerBrand}>
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                        />
                        <p>
                            Оборудование, автоматизация и техническая поддержка
                            бизнеса в одном месте.
                        </p>
                    </div>
                    <div className={styles.footerColumn}>
                        <h2>Покупателям</h2>
                        <Link to="/catalog">Каталог</Link>
                        <Link to="/solutions">Автоматизация</Link>
                        <Link to="/delivery">Доставка и оплата</Link>
                        <Link to="/warranty">Гарантия и возврат</Link>
                        <Link to="/cart">Корзина</Link>
                    </div>
                    <div className={styles.footerColumn}>
                        <h2>Сервис</h2>
                        <Link to="/service">Направления сервиса</Link>
                        <Link to="/service/request">Оставить заявку</Link>
                        <Link to="/cash-registration">Регистрация кассы</Link>
                        <Link to="/service/status">Проверить статус</Link>
                        <Link to="/contacts">Контакты</Link>
                    </div>
                    <div className={styles.footerColumn}>
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
                <div className={`container ${styles.footerBottom}`}>
                    <span>© 2026 VITMA MARKET</span>
                    <span>
                        {company.legalName} · ИНН {company.inn}
                    </span>
                    <Link to="/privacy">Политика обработки данных</Link>
                </div>
                <div className={`container ${styles.disclaimer}`}>
                    Информация о товарах и ценах носит ознакомительный характер
                    и не является публичной офертой. Итоговую стоимость и
                    наличие подтверждает менеджер.
                </div>
            </footer>
            <button
                className={styles.callback}
                type="button"
                onClick={() => openCallback()}
                aria-label="Заказать обратный звонок"
            >
                <PhoneCall />
                <span>Нужна консультация</span>
            </button>
            <div
                className={`${styles.toast} ${notice ? styles.toastVisible : ''}`}
                role="status"
            >
                {notice}
            </div>
        </div>
    );
}
