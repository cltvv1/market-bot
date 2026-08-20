import {
    ArrowRight,
    BadgeCheck,
    Building2,
    ClipboardCheck,
    MapPin,
    MonitorCog,
    PackageSearch,
    ReceiptText,
    RefreshCw,
    ShoppingCart,
    Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { ServiceCard } from '../components/ServiceCard';
import { products } from '../data/catalog';
import { serviceDirections } from '../data/services';
import styles from './HomePage.module.css';

const tasks = [
    {
        title: 'Купить оборудование',
        text: 'Кассы, сканеры, POS-системы и готовые комплекты.',
        to: '/catalog',
        icon: ShoppingCart,
    },
    {
        title: 'Зарегистрировать ККТ',
        text: 'Заполнить действующую анкету регистрации кассы.',
        to: '/cash-registration',
        icon: ReceiptText,
    },
    {
        title: 'Заменить ФН',
        text: 'Создать заявку на замену фискального накопителя.',
        to: '/service/request?type=fn_replacement',
        icon: RefreshCw,
    },
    {
        title: 'Настроить кассу',
        text: 'Запросить удалённую диагностику или настройку ККТ.',
        to: '/service/request?type=kkt_remote_work',
        icon: MonitorCog,
    },
    {
        title: 'Проверить статус',
        text: 'Посмотреть текущее состояние сервисной заявки.',
        to: '/service/status',
        icon: ClipboardCheck,
    },
    {
        title: 'Оставить заявку',
        text: 'Описать задачу, чтобы оператор предложил решение.',
        to: '/service/request',
        icon: Wrench,
    },
] as const;

const supportLinks = [
    {
        title: 'Мои организации',
        text: 'Кассы, обращения и доступы представителей.',
        to: '/organizations',
        icon: Building2,
    },
    {
        title: 'Доставка и оплата',
        text: 'Условия получения оборудования и расчётов.',
        to: '/delivery',
        icon: PackageSearch,
    },
    {
        title: 'Контакты сервиса',
        text: 'Адрес, режим работы и способы связи.',
        to: '/contacts',
        icon: MapPin,
    },
] as const;

const popularProducts = products
    .filter((product) => product.popular)
    .slice(0, 4);

export function HomePage() {
    return (
        <>
            <section className={styles.hero}>
                <div className={`container ${styles.heroGrid}`}>
                    <div className={styles.heroCopy}>
                        <span className={styles.eyebrow}>
                            VITMA MARKET · Красноярск
                        </span>
                        <h1>Кассовая техника и сервис для бизнеса</h1>
                        <p>
                            Подбираем оборудование, запускаем торговые точки и
                            поддерживаем кассы после покупки одной командой.
                        </p>
                        <div className={styles.heroActions}>
                            <Link className="button button--dark" to="/catalog">
                                Перейти в каталог
                                <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                            <Link
                                className="button button--secondary"
                                to="/service/request"
                            >
                                Оставить заявку
                            </Link>
                        </div>
                    </div>
                    <div className={styles.heroMedia}>
                        <img
                            src="/site/assets/hero-service.png"
                            alt="Кассовое оборудование в сервисном центре VITMA MARKET"
                            width="960"
                            height="640"
                        />
                    </div>
                </div>
            </section>

            <section
                className={styles.trustStrip}
                aria-label="Основные направления работы"
            >
                <div className={`container ${styles.trustGrid}`}>
                    <div>
                        <BadgeCheck aria-hidden="true" />
                        <span>
                            <strong>Работа с ККТ</strong>
                            Регистрация и сервис по 54-ФЗ
                        </span>
                    </div>
                    <div>
                        <Wrench aria-hidden="true" />
                        <span>
                            <strong>Свой сервис</strong>
                            Настройка, диагностика и ремонт
                        </span>
                    </div>
                    <div>
                        <MonitorCog aria-hidden="true" />
                        <span>
                            <strong>Два формата</strong>
                            Удалённая помощь и выезд
                        </span>
                    </div>
                    <div>
                        <Building2 aria-hidden="true" />
                        <span>
                            <strong>Для бизнеса</strong>
                            Работаем с ИП и организациями
                        </span>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <div className="container">
                    <div className={styles.heading}>
                        <div>
                            <h2>Что вы хотите сделать?</h2>
                            <p>Выберите задачу, чтобы сразу перейти к ней.</p>
                        </div>
                    </div>
                    <div className={styles.taskGrid}>
                        {tasks.map((task) => {
                            const Icon = task.icon;
                            return (
                                <Link key={task.title} to={task.to}>
                                    <Icon aria-hidden="true" />
                                    <span>
                                        <strong>{task.title}</strong>
                                        <small>{task.text}</small>
                                    </span>
                                    <ArrowRight
                                        className={styles.cardArrow}
                                        size={17}
                                        aria-hidden="true"
                                    />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className={`${styles.section} ${styles.mutedSection}`}>
                <div className="container">
                    <div className={styles.heading}>
                        <div>
                            <h2>Популярное оборудование</h2>
                            <p>
                                Демонстрационные позиции из текущего каталога.
                            </p>
                        </div>
                        <Link to="/catalog?sort=popular">
                            Смотреть каталог
                            <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    </div>
                    <div className={`product-grid ${styles.productGrid}`}>
                        {popularProducts.map((product) => (
                            <ProductCard product={product} key={product.id} />
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <div className="container">
                    <div className={styles.heading}>
                        <div>
                            <h2>Сервисные услуги</h2>
                            <p>
                                Действующие сценарии заявок, доступные на сайте.
                            </p>
                        </div>
                        <Link to="/service">
                            Все о сервисе
                            <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    </div>
                    <div className={styles.serviceGrid}>
                        {serviceDirections.map((service) => (
                            <ServiceCard key={service.id} service={service} />
                        ))}
                    </div>
                </div>
            </section>

            <section className={`${styles.section} ${styles.supportSection}`}>
                <div className="container">
                    <div className={styles.heading}>
                        <div>
                            <h2>Поддержка и информация</h2>
                            <p>Только действующие разделы клиентского сайта.</p>
                        </div>
                    </div>
                    <div className={styles.supportGrid}>
                        {supportLinks.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link key={item.title} to={item.to}>
                                    <Icon aria-hidden="true" />
                                    <span>
                                        <strong>{item.title}</strong>
                                        <small>{item.text}</small>
                                    </span>
                                    <ArrowRight size={17} aria-hidden="true" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>
        </>
    );
}
