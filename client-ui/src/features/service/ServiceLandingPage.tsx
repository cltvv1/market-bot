import {
    ArrowRight,
    FileCheck2,
    Headphones,
    Search,
    Settings2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
export function ServiceLandingPage() {
    return (
        <>
            <section className="ref-service-intro">
                <span className="ref-eyebrow">
                    Оборудование. Настройка. Поддержка.
                </span>
                <h1>Сервис VITMA MARKET</h1>
                <p>
                    Поможем с кассой и программой, регистрацией и заменой ФН.
                    Опишите задачу, а необходимые детали уточнит сотрудник.
                </p>
                <Link
                    className="ref-button ref-button--primary"
                    to="/service/request"
                >
                    Оставить заявку
                    <ArrowRight size={18} />
                </Link>
            </section>
            <div className="ref-service-layout">
                <section
                    className="ref-service-paths"
                    aria-labelledby="service-paths-heading"
                >
                    <h2 id="service-paths-heading">С чего начнём?</h2>
                    <article className="ref-service-path">
                        <Settings2 size={24} aria-hidden="true" />
                        <div>
                            <h3>Помощь с оборудованием</h3>
                            <p>
                                Касса не работает, нужна настройка или
                                обновление программы.
                            </p>
                            <Link to="/service/request?type=kkt_remote_work">
                                Описать задачу
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </article>
                    <article className="ref-service-path">
                        <FileCheck2 size={24} aria-hidden="true" />
                        <div>
                            <h3>Регистрация кассы и замена ФН</h3>
                            <p>
                                Подготовить кассу к работе или заменить
                                фискальный накопитель.
                            </p>
                            <div className="ref-path-links">
                                <Link to="/cash-registration">
                                    Регистрация ККТ
                                    <ArrowRight size={16} />
                                </Link>
                                <Link to="/service/request?type=fn_replacement">
                                    Замена ФН
                                    <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </article>
                    <article className="ref-service-path">
                        <Headphones size={24} aria-hidden="true" />
                        <div>
                            <h3>Вопрос оператору</h3>
                            <p>
                                Не знаете, какую услугу выбрать? Свяжитесь с
                                нами удобным способом.
                            </p>
                            <Link to="/contacts">
                                Связаться
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </article>
                </section>
                <aside className="ref-existing-request">
                    <Search size={25} aria-hidden="true" />
                    <h2>Уже оставили заявку?</h2>
                    <p>
                        Проверьте статус обращения, прочитайте ответ сотрудника
                        и откройте документы.
                    </p>
                    <Link className="ref-button" to="/service/requests">
                        Мои заявки
                        <ArrowRight size={16} />
                    </Link>
                    <small>
                        Откройте в том же браузере, где создавали обращение.
                    </small>
                </aside>
            </div>
            <section className="ref-service-process">
                <h2>Что дальше</h2>
                <ol>
                    <li>
                        <span>01</span>
                        <div>
                            <h3>Вы описываете задачу</h3>
                            <p>
                                Оставляете данные оборудования и контакт для
                                связи.
                            </p>
                        </div>
                    </li>
                    <li>
                        <span>02</span>
                        <div>
                            <h3>Сотрудник уточняет детали</h3>
                            <p>Согласовывает необходимые работы и условия.</p>
                        </div>
                    </li>
                    <li>
                        <span>03</span>
                        <div>
                            <h3>Продолжаете в обращении</h3>
                            <p>Следите за статусом, ответами и документами.</p>
                        </div>
                    </li>
                </ol>
            </section>
        </>
    );
}
