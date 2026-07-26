import {
    Building2,
    Clock3,
    CreditCard,
    Mail,
    MapPin,
    PackageCheck,
    Phone,
    RotateCcw,
    ShieldCheck,
    Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { company } from '../data/company';

export function AboutPage() {
    return (
        <>
            <section className="inner-hero">
                <div className="container">
                    <Breadcrumbs items={[{ label: 'О компании' }]} />
                    <div>
                        <span className="eyebrow">VITMA MARKET</span>
                        <h1>
                            Технологический партнёр для торговли и сферы услуг
                        </h1>
                        <p>
                            Помогаем бизнесу работать с кассами, маркировкой и
                            учётом без простоев и лишней сложности.
                        </p>
                    </div>
                </div>
            </section>
            <section className="section">
                <div className="container editorial-grid">
                    <div>
                        <span className="eyebrow">Наш подход</span>
                        <h2>Оборудование — только начало работы</h2>
                    </div>
                    <div>
                        <p>
                            VITMA MARKET объединяет поставку кассовой техники,
                            автоматизацию и собственный сервисный центр. Мы не
                            оставляем клиента разбираться с несколькими
                            подрядчиками, когда нужно зарегистрировать кассу,
                            настроить программу или устранить сбой.
                        </p>
                        <p>
                            Работаем с новыми торговыми точками и действующими
                            организациями: от консультации и поставки до
                            плановой замены ФН и сопровождения инфраструктуры.
                        </p>
                    </div>
                </div>
                <div className="container metrics">
                    <div>
                        <strong>10+</strong>
                        <span>лет экспертизы команды</span>
                    </div>
                    <div>
                        <strong>1 500+</strong>
                        <span>касс запущено и обслуживается</span>
                    </div>
                    <div>
                        <strong>15 мин</strong>
                        <span>среднее время первого ответа</span>
                    </div>
                    <div>
                        <strong>8</strong>
                        <span>ключевых брендов оборудования</span>
                    </div>
                </div>
            </section>
            <section className="section section--soft">
                <div className="container values">
                    <article>
                        <Building2 />
                        <h3>Понимаем B2B</h3>
                        <p>
                            Счета, договоры, закрывающие документы и понятные
                            сроки.
                        </p>
                    </article>
                    <article>
                        <ShieldCheck />
                        <h3>Отвечаем за результат</h3>
                        <p>
                            Проверяем работу решения и фиксируем историю
                            обслуживания.
                        </p>
                    </article>
                    <article>
                        <PackageCheck />
                        <h3>Подбираем совместимое</h3>
                        <p>
                            Учитываем кассовую программу, маркировку и будущий
                            рост.
                        </p>
                    </article>
                </div>
            </section>
        </>
    );
}

export function DeliveryPage() {
    return (
        <div className="page container">
            <Breadcrumbs items={[{ label: 'Доставка и оплата' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Получение заказа</span>
                    <h1>Доставка и оплата</h1>
                    <p>
                        Согласуем удобный способ после проверки наличия и
                        комплектации.
                    </p>
                </div>
            </header>
            <div className="info-card-grid">
                <article>
                    <PackageCheck />
                    <h2>Самовывоз</h2>
                    <p>
                        Из офиса VITMA MARKET в Красноярске после подтверждения
                        менеджером.
                    </p>
                    <strong>Бесплатно</strong>
                </article>
                <article>
                    <Truck />
                    <h2>По Красноярску</h2>
                    <p>
                        Курьерская доставка оборудования до офиса или торговой
                        точки.
                    </p>
                    <strong>Рассчитывается менеджером</strong>
                </article>
                <article>
                    <Truck />
                    <h2>По России</h2>
                    <p>
                        Отправка СДЭК или выбранной транспортной компанией с
                        упаковкой.
                    </p>
                    <strong>По тарифу перевозчика</strong>
                </article>
            </div>
            <section className="content-section">
                <h2>Способы оплаты</h2>
                <div className="payment-list">
                    <div>
                        <CreditCard />
                        <span>
                            <strong>Безналичный расчёт</strong>Счёт для ИП и
                            организаций, полный комплект документов.
                        </span>
                    </div>
                    <div>
                        <CreditCard />
                        <span>
                            <strong>Банковская карта</strong>При получении в
                            офисе или по ссылке после подтверждения.
                        </span>
                    </div>
                    <div>
                        <CreditCard />
                        <span>
                            <strong>Наличные</strong>В офисе компании с выдачей
                            кассового чека.
                        </span>
                    </div>
                </div>
            </section>
            <section className="notice-panel">
                <h2>Важно для кассовой техники</h2>
                <p>
                    Фискальный накопитель и регистрационные услуги согласуются
                    отдельно: срок ФН зависит от системы налогообложения и вида
                    деятельности.
                </p>
                <Link to="/service/request">Получить консультацию</Link>
            </section>
        </div>
    );
}

export function WarrantyPage() {
    return (
        <div className="page container">
            <Breadcrumbs items={[{ label: 'Гарантия и возврат' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">После покупки</span>
                    <h1>Гарантия и возврат</h1>
                    <p>
                        Официальная гарантия производителей и собственная
                        сервисная поддержка.
                    </p>
                </div>
            </header>
            <div className="info-card-grid">
                <article>
                    <ShieldCheck />
                    <h2>Гарантия</h2>
                    <p>
                        Срок указан в карточке и документации товара, обычно
                        12–36 месяцев.
                    </p>
                </article>
                <article>
                    <RotateCcw />
                    <h2>Возврат</h2>
                    <p>
                        Принимаем обращения по возврату и обмену в соответствии
                        с законодательством РФ.
                    </p>
                </article>
                <article>
                    <Building2 />
                    <h2>Сервис</h2>
                    <p>
                        Проводим диагностику и взаимодействуем с авторизованными
                        центрами.
                    </p>
                </article>
            </div>
            <section className="content-section prose">
                <h2>Как обратиться по гарантии</h2>
                <ol>
                    <li>
                        Подготовьте номер заказа, модель и серийный номер
                        оборудования.
                    </li>
                    <li>Опишите неисправность и приложите фото или видео.</li>
                    <li>
                        Оставьте сервисную заявку — оператор согласует
                        диагностику.
                    </li>
                </ol>
                <Link className="button button--primary" to="/service/request">
                    Оставить заявку
                </Link>
                <h2>Ограничения</h2>
                <p>
                    Фискальные накопители, программные лицензии и товары с
                    индивидуальной активацией имеют особые условия возврата.
                    Финальное решение принимается после проверки комплектации и
                    состояния товара.
                </p>
            </section>
        </div>
    );
}

export function ContactsPage() {
    return (
        <div className="page container">
            <Breadcrumbs items={[{ label: 'Контакты' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Связаться с нами</span>
                    <h1>Контакты VITMA MARKET</h1>
                    <p>
                        Ответим на вопрос, подберём оборудование или примем
                        сервисную заявку.
                    </p>
                </div>
            </header>
            <div className="contacts-layout">
                <section className="contact-details">
                    <a href={company.phoneHref}>
                        <Phone />
                        <span>
                            <small>Телефон</small>
                            <strong>{company.phone}</strong>
                        </span>
                    </a>
                    <a href={company.emailHref}>
                        <Mail />
                        <span>
                            <small>Email</small>
                            <strong>{company.email}</strong>
                        </span>
                    </a>
                    <div>
                        <MapPin />
                        <span>
                            <small>Адрес</small>
                            <strong>{company.address}</strong>
                        </span>
                    </div>
                    <div>
                        <Clock3 />
                        <span>
                            <small>Режим работы</small>
                            <strong>{company.schedule}</strong>
                        </span>
                    </div>
                    <div className="contact-actions">
                        <a
                            className="button button--primary"
                            href={company.phoneHref}
                        >
                            Позвонить
                        </a>
                        <Link
                            className="button button--secondary"
                            to="/service/request"
                        >
                            Оставить заявку
                        </Link>
                    </div>
                </section>
                <div
                    className="demo-map"
                    role="img"
                    aria-label={`Демонстрационная карта: ${company.address}`}
                >
                    <div className="map-grid" />
                    <div className="map-pin">
                        <MapPin />
                        <span>VITMA MARKET</span>
                    </div>
                    <small>Место для интерактивной карты</small>
                </div>
            </div>
            <section className="requisites">
                <h2>Реквизиты</h2>
                <dl>
                    <div>
                        <dt>Организация</dt>
                        <dd>{company.legalName}</dd>
                    </div>
                    <div>
                        <dt>ИНН / КПП</dt>
                        <dd>
                            {company.inn} / {company.kpp}
                        </dd>
                    </div>
                    <div>
                        <dt>ОГРН</dt>
                        <dd>{company.ogrn}</dd>
                    </div>
                    <div>
                        <dt>Юридический адрес</dt>
                        <dd>{company.address}</dd>
                    </div>
                </dl>
                <p>
                    Контакты и реквизиты демонстрационные и вынесены в
                    конфигурационный файл.
                </p>
            </section>
        </div>
    );
}

export function PrivacyPage() {
    return (
        <div className="page container narrow-page">
            <Breadcrumbs items={[{ label: 'Политика обработки данных' }]} />
            <header className="page-heading">
                <div>
                    <h1>Политика обработки персональных данных</h1>
                    <p>
                        Демонстрационная редакция для клиентского сайта VITMA
                        MARKET.
                    </p>
                </div>
            </header>
            <section className="content-section prose">
                <h2>Какие данные используются</h2>
                <p>
                    Имя, контактные данные, сведения об организации,
                    оборудовании и содержании обращения — только в объёме,
                    необходимом для обработки заказа или сервисной заявки.
                </p>
                <h2>Цель обработки</h2>
                <p>
                    Связь с клиентом, подготовка документов, поставка
                    оборудования, оказание сервисных услуг и информирование о
                    ходе работ.
                </p>
                <h2>Хранение</h2>
                <p>
                    В демонстрационной версии корзина, заказы и mock-заявки
                    сохраняются локально в браузере. При подключении
                    production-backend потребуется утвердить реальные сроки
                    хранения и юридическую редакцию документа.
                </p>
            </section>
        </div>
    );
}
