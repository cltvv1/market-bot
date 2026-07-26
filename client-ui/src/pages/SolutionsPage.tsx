import {
    ArrowRight,
    BriefcaseBusiness,
    Check,
    Coffee,
    Store,
    Warehouse,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { businessSolutions } from '../data/solutions';

const icons = {
    store: Store,
    cafe: Coffee,
    warehouse: Warehouse,
    services: BriefcaseBusiness,
};

export function SolutionsPage() {
    return (
        <>
            <section className="inner-hero solutions-hero">
                <div className="container">
                    <Breadcrumbs items={[{ label: 'Автоматизация бизнеса' }]} />
                    <div>
                        <span className="eyebrow">Решения по задаче</span>
                        <h1>Соберём не набор техники, а рабочую систему</h1>
                        <p>
                            Подберём оборудование, программы и сервис под
                            процессы конкретного бизнеса. Без лишних устройств и
                            разрозненных подрядчиков.
                        </p>
                    </div>
                </div>
            </section>
            <section className="section">
                <div className="container solution-list">
                    {businessSolutions.map((solution, index) => {
                        const Icon = icons[solution.icon];
                        return (
                            <article id={solution.id} key={solution.id}>
                                <div className="solution-list__number">
                                    0{index + 1}
                                </div>
                                <div className="solution-list__body">
                                    <Icon />
                                    <span>{solution.audience}</span>
                                    <h2>{solution.title}</h2>
                                    <p>{solution.description}</p>
                                    <ul>
                                        {solution.results.map((result) => (
                                            <li key={result}>
                                                <Check /> {result}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="solution-list__actions">
                                    <Link
                                        className="button button--primary"
                                        to={`/catalog?category=${solution.categoryId}`}
                                    >
                                        Подобрать оборудование
                                        <ArrowRight size={17} />
                                    </Link>
                                    <Link
                                        className="button button--secondary"
                                        to={`/service/request?type=${solution.serviceType}&solution=${solution.id}`}
                                    >
                                        Обсудить запуск
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>
            <section className="section section--graphite solution-cta">
                <div className="container">
                    <div>
                        <span className="eyebrow">Нестандартная задача</span>
                        <h2>
                            Разберём текущую схему и предложим следующий шаг
                        </h2>
                        <p>
                            Можно начать с короткой консультации, даже если
                            состав оборудования пока неизвестен.
                        </p>
                    </div>
                    <Link
                        className="button button--primary"
                        to="/service/request?type=consultation"
                    >
                        Описать задачу <ArrowRight />
                    </Link>
                </div>
            </section>
        </>
    );
}
