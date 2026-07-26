import { Search, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ProductCard } from '../components/ProductCard';
import { ServiceCard } from '../components/ServiceCard';
import { EmptyState } from '../components/ui';
import { categories, products } from '../data/catalog';
import { serviceDirections } from '../data/services';

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

export function SearchPage() {
    const [params, setParams] = useSearchParams();
    const query = params.get('q') || '';
    const normalizedQuery = normalize(query);
    const productResults = useMemo(
        () =>
            normalizedQuery
                ? products.filter((product) =>
                      normalize(
                          [
                              product.name,
                              product.brand,
                              product.shortDescription,
                              ...product.features,
                          ].join(' '),
                      ).includes(normalizedQuery),
                  )
                : [],
        [normalizedQuery],
    );
    const serviceResults = useMemo(
        () =>
            normalizedQuery
                ? serviceDirections.filter((service) =>
                      normalize(
                          `${service.title} ${service.description}`,
                      ).includes(normalizedQuery),
                  )
                : [],
        [normalizedQuery],
    );
    const total = productResults.length + serviceResults.length;

    return (
        <div className="page container search-page">
            <Breadcrumbs items={[{ label: 'Поиск' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Товары и услуги</span>
                    <h1>Поиск по VITMA MARKET</h1>
                    <p>
                        Найдите оборудование, услугу или готовое направление
                        работ одним запросом.
                    </p>
                </div>
            </header>
            <form
                className="search-page__form"
                role="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const value = data.get('q');
                    setParams({ q: typeof value === 'string' ? value : '' });
                }}
            >
                <Search />
                <input
                    name="q"
                    aria-label="Поиск по товарам и услугам"
                    defaultValue={query}
                    placeholder="Например, замена ФН или АТОЛ 30Ф"
                    autoFocus
                />
                <button className="button button--dark" type="submit">
                    Найти
                </button>
            </form>

            {!normalizedQuery ? (
                <div className="search-suggestions">
                    <strong>Популярные запросы</strong>
                    <div>
                        {[
                            'онлайн-касса',
                            'АТОЛ',
                            'сканер',
                            'замена ФН',
                            'регистрация',
                        ].map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setParams({ q: item })}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            ) : total === 0 ? (
                <EmptyState
                    icon={<Search />}
                    title="Ничего не найдено"
                    text="Попробуйте сократить запрос или оставьте заявку — специалист поможет подобрать решение."
                    action={
                        <Link
                            className="button button--primary"
                            to="/service/request?type=consultation"
                        >
                            Спросить специалиста
                        </Link>
                    }
                />
            ) : (
                <div className="search-results">
                    <p className="search-results__summary">
                        По запросу «{query}» найдено: {total}
                    </p>
                    {productResults.length > 0 && (
                        <section>
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Каталог</span>
                                    <h2>Оборудование</h2>
                                </div>
                                <Link
                                    to={`/catalog?q=${encodeURIComponent(query)}`}
                                >
                                    Показать в каталоге
                                </Link>
                            </div>
                            <div className="product-grid">
                                {productResults.slice(0, 8).map((product) => (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                    {serviceResults.length > 0 && (
                        <section>
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Сервис</span>
                                    <h2>Услуги</h2>
                                </div>
                                <Link to="/service">
                                    Все направления <Wrench size={17} />
                                </Link>
                            </div>
                            <div className="service-grid">
                                {serviceResults.map((service) => (
                                    <ServiceCard
                                        key={service.id}
                                        service={service}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                    {productResults.length > 0 && (
                        <div className="search-related">
                            <strong>Подходящие категории:</strong>
                            {categories
                                .filter((category) =>
                                    productResults.some(
                                        (product) =>
                                            product.categoryId === category.id,
                                    ),
                                )
                                .map((category) => (
                                    <Link
                                        key={category.id}
                                        to={`/catalog?category=${category.id}`}
                                    >
                                        {category.name}
                                    </Link>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
