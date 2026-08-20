import {
    ArrowRight,
    Building2,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    FileCheck2,
    MapPin,
    MonitorCog,
    ReceiptText,
    RefreshCw,
    Settings2,
    Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { company } from '../data/company';
import { serviceDirections } from '../data/services';
import { servicePackages } from '../data/solutions';
import styles from './ServicePage.module.css';

const serviceIcons = {
    fn_replacement: RefreshCw,
    firmware_update: Settings2,
    kkt_remote_work: MonitorCog,
};

const serviceEntries = [
    {
        id: 'registration',
        title: 'Регистрация ККТ',
        description: 'Заполнить действующую анкету регистрации кассы.',
        to: '/cash-registration',
        icon: ReceiptText,
    },
    ...serviceDirections.map((service) => ({
        id: service.id,
        title: service.title,
        description: service.description,
        to: `/service/request?type=${service.id}`,
        icon: serviceIcons[service.id as keyof typeof serviceIcons] || Wrench,
    })),
    {
        id: 'other',
        title: 'Другая сервисная задача',
        description:
            'Опишите проблему, и оператор выберет нужного специалиста.',
        to: '/service/request',
        icon: Wrench,
    },
];

const usefulLinks = [
    {
        title: 'Статус заявки',
        text: 'Проверить текущее состояние обращения.',
        to: '/service/status',
        icon: ClipboardCheck,
    },
    {
        title: 'Мои организации',
        text: 'Посмотреть связанные кассы и историю обращений.',
        to: '/organizations',
        icon: Building2,
    },
    {
        title: 'Контакты',
        text: 'Адрес, телефон и режим работы сервисного центра.',
        to: '/contacts',
        icon: MapPin,
    },
] as const;

export function ServicePage() {
    return (
        <>
            <section className={styles.hero}>
                <div className="container">
                    <Breadcrumbs items={[{ label: 'Сервисный центр' }]} />
                    <div className={styles.heroGrid}>
                        <div className={styles.heroCopy}>
                            <span>Сервис VITMA MARKET</span>
                            <h1>Сервисный центр для кассового оборудования</h1>
                            <p>
                                Регистрация ККТ, замена ФН, настройка и
                                диагностика. Разовые обращения и сопровождение
                                организаций в одной системе.
                            </p>
                            <div className={styles.heroActions}>
                                <Link
                                    className="button button--primary"
                                    to="/service/request"
                                >
                                    Оставить заявку
                                    <ArrowRight size={18} aria-hidden="true" />
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
                                    Регистрация ККТ
                                </Link>
                            </div>
                        </div>
                        <div className={styles.heroMedia}>
                            <img
                                src="/site/assets/service-engineer.png"
                                alt="Специалист VITMA MARKET обслуживает кассовое оборудование"
                                width="800"
                                height="600"
                            />
                        </div>
                        <aside
                            className={styles.serviceFacts}
                            aria-label="Режим работы сервиса"
                        >
                            <div>
                                <Clock3 aria-hidden="true" />
                                <span>
                                    <strong>Режим работы</strong>
                                    {company.schedule}
                                </span>
                            </div>
                            <div>
                                <MapPin aria-hidden="true" />
                                <span>
                                    <strong>Сервисный центр</strong>
                                    {company.address}
                                </span>
                            </div>
                            <div>
                                <MonitorCog aria-hidden="true" />
                                <span>
                                    <strong>Удалённо и на месте</strong>
                                    Формат уточняется по задаче
                                </span>
                            </div>
                        </aside>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <div className="container">
                    <div className={styles.heading}>
                        <h2>Выберите нужную услугу</h2>
                        <p>
                            Начните с подходящего сценария или оставьте
                            универсальную заявку.
                        </p>
                    </div>
                    <div className={styles.serviceGrid}>
                        {serviceEntries.map((service) => {
                            const Icon = service.icon;
                            return (
                                <Link key={service.id} to={service.to}>
                                    <Icon aria-hidden="true" />
                                    <span>
                                        <strong>{service.title}</strong>
                                        <small>{service.description}</small>
                                    </span>
                                    <ArrowRight size={17} aria-hidden="true" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className={`${styles.section} ${styles.mutedSection}`}>
                <div className="container">
                    <div className={styles.heading}>
                        <h2>Какой формат вам нужен?</h2>
                        <p>
                            Это способ описать задачу, а не отдельный продукт
                            или новый тип заявки.
                        </p>
                    </div>
                    <div className={styles.packageGrid}>
                        {servicePackages.map((item, index) => (
                            <article key={item.id}>
                                <div className={styles.packageTitle}>
                                    <span>
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <div>
                                        <small>{item.label}</small>
                                        <h3>{item.title}</h3>
                                    </div>
                                </div>
                                <p>{item.description}</p>
                                <ul>
                                    {item.features.map((feature) => (
                                        <li key={feature}>
                                            <CheckCircle2 aria-hidden="true" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.nextStep}>
                <div className={`container ${styles.nextStepInner}`}>
                    <div>
                        <FileCheck2 aria-hidden="true" />
                        <span>
                            <strong>Не уверены, с чего начать?</strong>
                            Опишите задачу, оператор уточнит детали и предложит
                            следующий шаг.
                        </span>
                    </div>
                    <nav aria-label="Действия по сервису">
                        <Link
                            className="button button--primary"
                            to="/service/request"
                        >
                            Оставить заявку
                            <ArrowRight size={17} aria-hidden="true" />
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
                            Регистрация ККТ
                        </Link>
                    </nav>
                </div>
            </section>

            <section className={`${styles.section} ${styles.usefulSection}`}>
                <div className="container">
                    <div className={styles.heading}>
                        <h2>Рабочие разделы</h2>
                        <p>Информация и функции, уже доступные клиентам.</p>
                    </div>
                    <div className={styles.usefulGrid}>
                        {usefulLinks.map((item) => {
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
