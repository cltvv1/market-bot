import { useRef, useState } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    FileCheck2,
    Headphones,
    Menu,
    Search,
    Settings2,
    X,
} from 'lucide-react';
import './foundation.css';
import './reference-client.css';

export default function ReferenceClientApp() {
    const [menu, setMenu] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
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
                    <a href="/site/" className="ref-public-brand">
                        <img
                            src="/site/assets/vitmamarket-logo.png"
                            alt="VITMA MARKET"
                            width="155"
                            height="52"
                        />
                    </a>
                    <nav
                        aria-label="Главная навигация"
                        className="ref-public-nav"
                    >
                        <a href="/site/catalog">Оборудование</a>
                        <a href="/site/reference/service" aria-current="page">
                            Сервис
                        </a>
                        <a href="/site/contacts">Контакты</a>
                    </nav>
                    <a className="ref-org-link" href="/site/organizations">
                        Мои организации
                        <ArrowUpRight size={17} />
                    </a>
                    <button
                        ref={trigger}
                        className="ref-icon-button ref-public-menu-trigger"
                        aria-label={menu ? 'Закрыть меню' : 'Открыть меню'}
                        aria-expanded={menu}
                        aria-controls="reference-public-menu"
                        onClick={() => setMenu((open) => !open)}
                    >
                        {menu ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
                {menu && (
                    <nav
                        id="reference-public-menu"
                        aria-label="Мобильная навигация"
                    >
                        <a href="/site/catalog">Оборудование</a>
                        <a href="/site/reference/service" aria-current="page">
                            Сервис
                        </a>
                        <a href="/site/organizations">Мои организации</a>
                        <a href="/site/contacts">Контакты</a>
                    </nav>
                )}
            </header>
            <main id="service-content" className="ref-public-container">
                <div className="ref-public-breadcrumb">
                    <a href="/site/">Главная</a>
                    <span>/</span>
                    <span>Сервис</span>
                </div>
                <section className="ref-service-intro">
                    <span className="ref-eyebrow">
                        Оборудование. Настройка. Поддержка.
                    </span>
                    <h1>Сервис VITMA MARKET</h1>
                    <p>
                        Поможем с кассой и программой, регистрацией и заменой
                        ФН. Опишите задачу, а необходимые детали уточнит
                        сотрудник.
                    </p>
                    <a
                        className="ref-button ref-button--primary"
                        href="/site/service/request"
                    >
                        Оставить заявку
                        <ArrowRight size={18} />
                    </a>
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
                                <a href="/site/service/request?type=kkt_remote_work">
                                    Описать задачу
                                    <ArrowRight size={16} />
                                </a>
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
                                    <a href="/site/cash-registration">
                                        Регистрация ККТ
                                        <ArrowRight size={16} />
                                    </a>
                                    <a href="/site/service/request?type=fn_replacement">
                                        Замена ФН
                                        <ArrowRight size={16} />
                                    </a>
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
                                <a href="/site/contacts">
                                    Связаться
                                    <ArrowRight size={16} />
                                </a>
                            </div>
                        </article>
                    </section>
                    <aside className="ref-existing-request">
                        <Search size={25} aria-hidden="true" />
                        <h2>Уже оставили заявку?</h2>
                        <p>
                            Проверьте статус сервисного обращения, прочитайте
                            ответ сотрудника и откройте документы.
                        </p>
                        <a className="ref-button" href="/site/service/status">
                            Проверить статус
                            <ArrowRight size={16} />
                        </a>
                        <small>
                            Используйте ссылку, полученную после отправки
                            заявки, или её номер в том же браузере.
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
                                <p>
                                    Согласовывает необходимые работы и условия.
                                </p>
                            </div>
                        </li>
                        <li>
                            <span>03</span>
                            <div>
                                <h3>Продолжаете в обращении</h3>
                                <p>
                                    Следите за статусом, ответами и документами.
                                </p>
                            </div>
                        </li>
                    </ol>
                </section>
            </main>
            <footer className="ref-public-footer">
                <div className="ref-public-container">
                    <span>VITMA MARKET</span>
                    <span>Кассовое оборудование и сервис</span>
                    <a href="/site/privacy">Конфиденциальность</a>
                </div>
            </footer>
        </div>
    );
}
