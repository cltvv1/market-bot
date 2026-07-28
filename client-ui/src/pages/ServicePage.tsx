import {
    ArrowRight,
    CheckCircle2,
    Clock3,
    Headphones,
    MapPin,
    MonitorCog,
    ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ServiceCard } from '../components/ServiceCard';
import { serviceDirections } from '../data/services';
import { servicePackages } from '../data/solutions';

export function ServicePage() {
    return (
        <>
            <section className="service-hero">
                <div className="container">
                    <Breadcrumbs items={[{ label: 'Сервисный центр' }]} />
                    <div className="service-hero__grid">
                        <div>
                            <span className="eyebrow">Сервис VITMA MARKET</span>
                            <h1>
                                Вернём оборудование в работу и предупредим
                                следующий сбой
                            </h1>
                            <p>
                                Кассы, ОФД, маркировка, товароучёт и периферия.
                                Принимаем разовые обращения и ведём постоянное
                                сопровождение организаций.
                            </p>
                            <div className="hero-actions">
                                <Link
                                    className="button button--primary"
                                    to="/service/request"
                                >
                                    Оставить заявку <ArrowRight />
                                </Link>
                                <Link
                                    className="button button--secondary"
                                    to="/service/status"
                                >
                                    Проверить статус
                                </Link>
                                <Link
                                    className="button button--secondary"
                                    to="/cash-registration"
                                >
                                    Анкета регистрации ККТ
                                </Link>
                            </div>
                        </div>
                        <div className="service-hero__panel">
                            <strong>15 минут</strong>
                            <span>среднее время первого ответа</span>
                            <hr />
                            <p>
                                <Clock3 /> Пн–Пт, 09:00–18:00
                            </p>
                            <p>
                                <MapPin /> Выезд по Красноярску
                            </p>
                            <p>
                                <MonitorCog /> Удалённая поддержка по России
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            <section className="section section--soft">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Формат работы</span>
                            <h2>
                                От одной задачи до постоянного сопровождения
                            </h2>
                            <p>
                                Начать можно с разового обращения. Договор и
                                организация в системе нужны только для
                                регулярного обслуживания.
                            </p>
                        </div>
                    </div>
                    <div className="service-packages">
                        {servicePackages.map((item, index) => (
                            <article
                                className={
                                    index === 1
                                        ? 'service-package service-package--featured'
                                        : 'service-package'
                                }
                                key={item.id}
                            >
                                <span>{item.label}</span>
                                <h3>{item.title}</h3>
                                <p>{item.description}</p>
                                <ul>
                                    {item.features.map((feature) => (
                                        <li key={feature}>
                                            <CheckCircle2 /> {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    className={
                                        index === 1
                                            ? 'button button--primary'
                                            : 'button button--secondary'
                                    }
                                    to={`/service/request?package=${item.id}`}
                                >
                                    Выбрать формат <ArrowRight size={17} />
                                </Link>
                            </article>
                        ))}
                    </div>
                </div>
            </section>
            <section className="section">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Направления работ</span>
                            <h2>Решаем задачи вокруг кассы целиком</h2>
                            <p>
                                Если не знаете, какой пункт выбрать, используйте
                                «Другая проблема» — оператор сам назначит
                                нужного специалиста.
                            </p>
                        </div>
                    </div>
                    <div className="service-grid">
                        {serviceDirections.map((service) => (
                            <ServiceCard service={service} key={service.id} />
                        ))}
                    </div>
                </div>
            </section>
            <section className="section section--soft">
                <div className="container">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Порядок работы</span>
                            <h2>Что произойдёт после заявки</h2>
                        </div>
                    </div>
                    <div className="service-process">
                        <article>
                            <span>01</span>
                            <h3>Оператор проверит данные</h3>
                            <p>
                                Уточнит детали и назначит профильного
                                специалиста.
                            </p>
                        </article>
                        <article>
                            <span>02</span>
                            <h3>Проведём диагностику</h3>
                            <p>
                                Удалённо, на выезде или в нашем сервисном
                                центре.
                            </p>
                        </article>
                        <article>
                            <span>03</span>
                            <h3>Согласуем решение</h3>
                            <p>
                                Назовём стоимость и срок до начала платных
                                работ.
                            </p>
                        </article>
                        <article>
                            <span>04</span>
                            <h3>Закроем заявку</h3>
                            <p>
                                Проверим результат и зафиксируем историю
                                обслуживания.
                            </p>
                        </article>
                    </div>
                </div>
            </section>
            <section className="section">
                <div className="container service-trust">
                    <div>
                        <Headphones />
                        <h3>Живой специалист</h3>
                        <p>Без бесконечного голосового меню и переадресаций.</p>
                    </div>
                    <div>
                        <ShieldCheck />
                        <h3>Гарантия на работы</h3>
                        <p>
                            Фиксируем результат и остаёмся на связи после
                            ремонта.
                        </p>
                    </div>
                    <div>
                        <CheckCircle2 />
                        <h3>Понятный статус</h3>
                        <p>
                            Вы всегда знаете, кто работает над заявкой и что
                            дальше.
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}
