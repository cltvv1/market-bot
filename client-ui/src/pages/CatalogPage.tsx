import { Info, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ProductCard } from '../components/ProductCard';
import { Drawer, EmptyState, Skeleton } from '../components/ui';
import { categories, products } from '../data/catalog';
import styles from './CatalogPage.module.css';

interface FilterState {
    category: string;
    selectedBrands: string[];
    stockOnly: boolean;
}

const catalogBrands = [
    ...new Set(products.map((product) => product.brand)),
].sort((left, right) => left.localeCompare(right, 'ru'));

const categoryCounts = new Map(
    categories.map((category) => [
        category.id,
        products.filter((product) => product.categoryId === category.id).length,
    ]),
);

function Filters({
    value,
    onChange,
}: {
    value: FilterState;
    onChange: (value: FilterState) => void;
}) {
    const setCategory = (category: string) => onChange({ ...value, category });
    const toggleBrand = (brand: string) =>
        onChange({
            ...value,
            selectedBrands: value.selectedBrands.includes(brand)
                ? value.selectedBrands.filter((item) => item !== brand)
                : [...value.selectedBrands, brand],
        });

    return (
        <div className={styles.filters}>
            <fieldset className={styles.filterGroup}>
                <legend>Категория</legend>
                <button
                    className={!value.category ? styles.activeCategory : ''}
                    type="button"
                    onClick={() => setCategory('')}
                >
                    Все товары <span>{products.length}</span>
                </button>
                {categories.map((category) => (
                    <button
                        className={
                            value.category === category.id
                                ? styles.activeCategory
                                : ''
                        }
                        type="button"
                        onClick={() => setCategory(category.id)}
                        key={category.id}
                    >
                        {category.name}
                        <span>{categoryCounts.get(category.id)}</span>
                    </button>
                ))}
            </fieldset>
            <fieldset className={styles.filterGroup}>
                <legend>Производитель</legend>
                {catalogBrands.map((brand) => (
                    <label key={brand}>
                        <input
                            type="checkbox"
                            checked={value.selectedBrands.includes(brand)}
                            onChange={() => toggleBrand(brand)}
                        />
                        <span>{brand}</span>
                    </label>
                ))}
            </fieldset>
            <fieldset className={styles.filterGroup}>
                <legend>Наличие</legend>
                <label>
                    <input
                        type="checkbox"
                        checked={value.stockOnly}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                stockOnly: event.target.checked,
                            })
                        }
                    />
                    <span>Только в наличии</span>
                </label>
            </fieldset>
        </div>
    );
}

export function CatalogPage() {
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState(params.get('q') || '');
    const [sort, setSort] = useState(params.get('sort') || 'popular');
    const [filters, setFilters] = useState<FilterState>({
        category: params.get('category') || '',
        selectedBrands: [],
        stockOnly: false,
    });
    const [draftFilters, setDraftFilters] = useState<FilterState>(filters);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = window.setTimeout(() => setLoading(false), 450);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const next = new URLSearchParams();
        if (filters.category) next.set('category', filters.category);
        if (query) next.set('q', query);
        if (sort !== 'popular') next.set('sort', sort);
        setParams(next, { replace: true });
    }, [filters.category, query, setParams, sort]);

    const filtered = useMemo(
        () =>
            products
                .filter(
                    (product) =>
                        (!filters.category ||
                            product.categoryId === filters.category) &&
                        (!query ||
                            `${product.name} ${product.brand} ${product.sku}`
                                .toLowerCase()
                                .includes(query.toLowerCase())) &&
                        (!filters.selectedBrands.length ||
                            filters.selectedBrands.includes(product.brand)) &&
                        (!filters.stockOnly || product.stock === 'in_stock'),
                )
                .sort((left, right) =>
                    sort === 'price-asc'
                        ? left.price - right.price
                        : sort === 'price-desc'
                          ? right.price - left.price
                          : sort === 'name'
                            ? left.name.localeCompare(right.name, 'ru')
                            : Number(Boolean(right.popular)) -
                              Number(Boolean(left.popular)),
                ),
        [filters, query, sort],
    );

    const activeFilterCount =
        Number(Boolean(filters.category)) +
        filters.selectedBrands.length +
        Number(filters.stockOnly);
    const selectedCategory = categories.find(
        (category) => category.id === filters.category,
    );

    const resetFilters = () => {
        setFilters({ category: '', selectedBrands: [], stockOnly: false });
        setQuery('');
    };
    const openFilters = () => {
        setDraftFilters(filters);
        setFiltersOpen(true);
    };
    const applyFilters = () => {
        setFilters(draftFilters);
        setFiltersOpen(false);
    };

    return (
        <div className={styles.page}>
            <div className="container">
                <Breadcrumbs items={[{ label: 'Каталог' }]} />
                <header className={styles.heading}>
                    <span>Оборудование для бизнеса</span>
                    <h1>Каталог оборудования</h1>
                    <p>
                        Кассовая техника, периферия и готовые комплекты с
                        настройкой.
                    </p>
                </header>

                <div className={styles.demoNotice} role="note">
                    <Info aria-hidden="true" />
                    <strong>{products.length} демонстрационные позиции</strong>
                    <span>
                        Цены и наличие могут отличаться от фактических. Итоговые
                        условия подтверждает менеджер.
                    </span>
                </div>

                <div className={styles.toolbar}>
                    <label className={styles.searchField}>
                        <span>Поиск в каталоге</span>
                        <div>
                            <Search aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Название, бренд или артикул"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    aria-label="Очистить поиск"
                                >
                                    <X aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    </label>
                    <button
                        className={`button button--secondary ${styles.mobileFilterButton}`}
                        type="button"
                        onClick={openFilters}
                    >
                        <SlidersHorizontal size={18} aria-hidden="true" />
                        Фильтры
                        {activeFilterCount > 0 ? (
                            <b>{activeFilterCount}</b>
                        ) : null}
                    </button>
                    <label className={styles.sortField}>
                        <span>Сортировка</span>
                        <select
                            value={sort}
                            onChange={(event) => setSort(event.target.value)}
                        >
                            <option value="popular">Сначала популярные</option>
                            <option value="price-asc">Сначала дешевле</option>
                            <option value="price-desc">Сначала дороже</option>
                            <option value="name">По названию</option>
                        </select>
                    </label>
                </div>

                {(query || activeFilterCount > 0) && (
                    <div className={styles.activeFilters} aria-label="Фильтры">
                        {query ? (
                            <button type="button" onClick={() => setQuery('')}>
                                Поиск: {query}{' '}
                                <X size={14} aria-hidden="true" />
                            </button>
                        ) : null}
                        {selectedCategory ? (
                            <button
                                type="button"
                                onClick={() =>
                                    setFilters({ ...filters, category: '' })
                                }
                            >
                                {selectedCategory.name}
                                <X size={14} aria-hidden="true" />
                            </button>
                        ) : null}
                        {filters.selectedBrands.map((brand) => (
                            <button
                                type="button"
                                key={brand}
                                onClick={() =>
                                    setFilters({
                                        ...filters,
                                        selectedBrands:
                                            filters.selectedBrands.filter(
                                                (item) => item !== brand,
                                            ),
                                    })
                                }
                            >
                                {brand} <X size={14} aria-hidden="true" />
                            </button>
                        ))}
                        {filters.stockOnly ? (
                            <button
                                type="button"
                                onClick={() =>
                                    setFilters({ ...filters, stockOnly: false })
                                }
                            >
                                В наличии <X size={14} aria-hidden="true" />
                            </button>
                        ) : null}
                        <button
                            className={styles.resetLink}
                            type="button"
                            onClick={resetFilters}
                        >
                            Сбросить все
                        </button>
                    </div>
                )}

                <div className={styles.catalogLayout}>
                    <aside className={styles.sidebar} aria-label="Фильтры">
                        <Filters value={filters} onChange={setFilters} />
                    </aside>
                    <section
                        className={styles.results}
                        aria-labelledby="catalog-results-title"
                    >
                        <div className={styles.resultsHead}>
                            <h2 id="catalog-results-title">
                                Товары <span>{filtered.length}</span>
                            </h2>
                        </div>
                        {loading ? (
                            <Skeleton count={6} />
                        ) : filtered.length ? (
                            <div className={styles.productGrid}>
                                {filtered.map((product) => (
                                    <ProductCard
                                        product={product}
                                        key={product.id}
                                    />
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Search aria-hidden="true" />}
                                title="Ничего не найдено"
                                text="Измените запрос или сбросьте фильтры."
                                action={
                                    <button
                                        className="button button--primary"
                                        type="button"
                                        onClick={resetFilters}
                                    >
                                        Сбросить фильтры
                                    </button>
                                }
                            />
                        )}
                    </section>
                </div>
            </div>

            <Drawer
                open={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                title="Фильтры каталога"
            >
                <div className={styles.mobileFilters}>
                    <Filters value={draftFilters} onChange={setDraftFilters} />
                    <div className={styles.drawerActions}>
                        <button
                            className="button button--secondary"
                            type="button"
                            onClick={() =>
                                setDraftFilters({
                                    category: '',
                                    selectedBrands: [],
                                    stockOnly: false,
                                })
                            }
                        >
                            Сбросить
                        </button>
                        <button
                            className="button button--primary"
                            type="button"
                            onClick={applyFilters}
                        >
                            Применить
                        </button>
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
