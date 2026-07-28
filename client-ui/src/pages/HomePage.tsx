import {
    ArrowRight,
    BadgeCheck,
    Building2,
    Clock3,
    Headphones,
    PackageCheck,
    ShieldCheck,
    Store,
    Coffee,
    Warehouse,
    BriefcaseBusiness,
    Truck,
    Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { brands } from '../data/company';
import { categories, products } from '../data/catalog';
import { serviceDirections } from '../data/services';
import { ProductCard } from '../components/ProductCard';
import { ServiceCard } from '../components/ServiceCard';
import { businessSolutions } from '../data/solutions';
import { useCallbackRequest } from '../context/CallbackContext';

const solutionIcons = {
    store: Store,
    cafe: Coffee,
    warehouse: Warehouse,
    services: BriefcaseBusiness,
};

export function HomePage() {
    const { openCallback } = useCallbackRequest();

    return (
        <>
            <section className="home-hero">
                <div className="container home-hero__content">
                    <div className="hero-signature" aria-label="Направления">
                        <span>Магазин</span>
                        <i />
                        <span>Сервис</span>
                        <i />
                        <span>Автоматизация</span>
                    </div>
                    <span className="eyebrow">VITMA MARKET · Красноярск</span>
                    <h1>
                        Кассовая техника и сервис, на которые можно опереться
                    </h1>
                    <p>
                        Подбираем оборудование, запускаем торговые точки и
                        поддерживаем кассы после покупки — без разрыва между
                        поставщиком и сервисом.
                    </p>
                    <div className="hero-actions">
                        <Link className="button button--primary" to="/catalog">
                            Перейти в каталог <ArrowRight size={18} />
                        </Link>
                        <Link
                            className="button button--light"
                            to="/service/request"
                        >
                            Оставить сервисную заявку <Wrench size={18} />
                        </Link>
                    </div>
                    <div className="hero-facts">
                        <span>
                            <BadgeCheck />
                            Работаем по 54-ФЗ
                        </span>
                        <span>
                            <Clock3 />
                            Ответ сервиса от 15 минут
                        </span>
                        <span>
                            <Building2 />
                            Для ИП и организаций
                        </span>
                    </div>
                </div>
            </section>

            <section className="section solution-picker">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">По типу бизнеса</span>
                            <h2>
                                Начните с задачи, а не с модели оборудования
                            </h2>
                            <p>
                                Покажем подходящий комплект и список работ для
                                вашего формата.
                            </p>
                        </div>
                        <Link to="/solutions">
                            Все решения <ArrowRight size={17} />
                        </Link>
                    </div>
                    <div className="solution-picker__grid">
                        {businessSolutions.map((solution) => {
                            const Icon = solutionIcons[solution.icon];
                            return (
                                <Link
                                    key={solution.id}
                                    to={`/solutions#${solution.id}`}
                                >
                                    <Icon />
                                    <span>{solution.audience}</span>
                                    <h3>{solution.title}</h3>
                                    <p>{solution.description}</p>
                                    <ArrowRight />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="section section--tight">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Оборудование</span>
                            <h2>Соберём рабочее место под ваш бизнес</h2>
                        </div>
                        <Link to="/catalog">
                            Весь каталог <ArrowRight size={17} />
                        </Link>
                    </div>
                    <div className="category-grid">
                        {categories.slice(0, 8).map((category, index) => (
                            <Link
                                className={`category-card category-card--${index % 4}`}
                                to={`/catalog?category=${category.id}`}
                                key={category.id}
                            >
                                <span>0{index + 1}</span>
                                <h3>{category.name}</h3>
                                <p>{category.description}</p>
                                <ArrowRight />
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section className="consultation-band">
                <div className="container">
                    <div>
                        <span className="eyebrow">Поможем определиться</span>
                        <h2>Не знаете, какая касса или услуга нужна?</h2>
                        <p>
                            Опишите задачу специалисту. Уточним требования и
                            предложим следующий шаг без обязательства покупать.
                        </p>
                    </div>
                    <button
                        className="button button--primary"
                        type="button"
                        onClick={() => openCallback('Подбор оборудования')}
                    >
                        Заказать консультацию <ArrowRight size={18} />
                    </button>
                </div>
            </section>

            <section className="section section--soft">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Выбор клиентов</span>
                            <h2>Популярное оборудование</h2>
                        </div>
                        <Link to="/catalog?sort=popular">
                            Смотреть всё <ArrowRight size={17} />
                        </Link>
                    </div>
                    <div className="product-grid">
                        {products
                            .filter((item) => item.popular)
                            .slice(0, 4)
                            .map((item) => (
                                <ProductCard product={item} key={item.id} />
                            ))}
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container split-intro">
                    <div className="split-intro__copy">
                        <span className="eyebrow">Сервисный центр</span>
                        <h2>Не просто продаём кассы. Отвечаем за их работу.</h2>
                        <p>
                            Инженеры VITMA MARKET работают с кассами, ОФД,
                            маркировкой и учётными системами. Заявка сразу
                            попадает в операторскую админку, а вы получаете
                            понятный статус и ответственного специалиста.
                        </p>
                        <Link className="button button--dark" to="/service">
                            Все услуги <ArrowRight size={18} />
                        </Link>
                    </div>
                    <div className="service-feature">
                        <img
                            src="/site/assets/service-engineer.png"
                            alt="Специалист сервисного центра настраивает кассовое оборудование"
                        />
                        <div>
                            <strong>От 15 минут</strong>
                            <span>до первого ответа по заявке</span>
                        </div>
                    </div>
                </div>
                <div className="service-grid service-grid--home">
                    {serviceDirections.slice(0, 6).map((service) => (
                        <ServiceCard key={service.id} service={service} />
                    ))}
                </div>
            </section>

            <section className="section section--graphite">
                <div className="container">
                    <div className="section-heading section-heading--light">
                        <div>
                            <span className="eyebrow">Почему мы</span>
                            <h2>Один партнёр на всём пути</h2>
                        </div>
                    </div>
                    <div className="advantage-grid">
                        <article>
                            <PackageCheck />
                            <h3>Подбор без переплаты</h3>
                            <p>
                                Смотрим на нагрузку и задачи, а не продаём самую
                                дорогую модель.
                            </p>
                        </article>
                        <article>
                            <Wrench />
                            <h3>Свой сервисный центр</h3>
                            <p>
                                Настройка, ремонт и сопровождение остаются
                                внутри одной команды.
                            </p>
                        </article>
                        <article>
                            <Truck />
                            <h3>Доставка и запуск</h3>
                            <p>
                                Привезём, подключим и обучим сотрудников работе
                                с оборудованием.
                            </p>
                        </article>
                        <article>
                            <ShieldCheck />
                            <h3>Официальная гарантия</h3>
                            <p>
                                Работаем с производителями и оформляем все
                                документы для бизнеса.
                            </p>
                        </article>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Простой процесс</span>
                            <h2>Как мы работаем</h2>
                        </div>
                    </div>
                    <ol className="steps">
                        <li>
                            <span>01</span>
                            <div>
                                <h3>Разбираемся в задаче</h3>
                                <p>
                                    Уточняем формат бизнеса, нагрузку и уже
                                    используемые системы.
                                </p>
                            </div>
                        </li>
                        <li>
                            <span>02</span>
                            <div>
                                <h3>Предлагаем решение</h3>
                                <p>
                                    Формируем понятную комплектацию, смету и
                                    сроки запуска.
                                </p>
                            </div>
                        </li>
                        <li>
                            <span>03</span>
                            <div>
                                <h3>Поставляем и настраиваем</h3>
                                <p>
                                    Регистрируем кассу, подключаем ОФД и
                                    интегрируем ПО.
                                </p>
                            </div>
                        </li>
                        <li>
                            <span>04</span>
                            <div>
                                <h3>Остаёмся на связи</h3>
                                <p>
                                    Поддерживаем оборудование и заранее
                                    напоминаем о важных сроках.
                                </p>
                            </div>
                        </li>
                    </ol>
                </div>
            </section>

            <section className="section section--soft">
                <div className="container brand-strip">
                    <span>Работаем с ведущими производителями</span>
                    <div>
                        {brands.map((brand) => (
                            <strong key={brand}>{brand}</strong>
                        ))}
                    </div>
                </div>
            </section>
            <section className="cta-band">
                <div className="container">
                    <div>
                        <span className="eyebrow">Есть задача?</span>
                        <h2>Подберём оборудование или подключим специалиста</h2>
                    </div>
                    <div>
                        <a
                            className="button button--light"
                            href="tel:+73912050505"
                        >
                            <Headphones size={18} />
                            Позвонить
                        </a>
                        <Link
                            className="button button--primary"
                            to="/service/request"
                        >
                            Оставить заявку <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
