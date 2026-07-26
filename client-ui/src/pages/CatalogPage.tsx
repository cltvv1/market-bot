import { SlidersHorizontal, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ProductCard } from '../components/ProductCard';
import { Drawer, EmptyState, Skeleton } from '../components/ui';
import { categories, products } from '../data/catalog';

function Filters({
    category,
    setCategory,
    brands,
    selectedBrands,
    setSelectedBrands,
    stockOnly,
    setStockOnly,
}: {
    category: string;
    setCategory: (value: string) => void;
    brands: string[];
    selectedBrands: string[];
    setSelectedBrands: (value: string[]) => void;
    stockOnly: boolean;
    setStockOnly: (value: boolean) => void;
}) {
    const toggleBrand = (brand: string) =>
        setSelectedBrands(
            selectedBrands.includes(brand)
                ? selectedBrands.filter((item) => item !== brand)
                : [...selectedBrands, brand],
        );
    return (
        <div className="filters">
            <div className="filter-group">
                <h3>Категория</h3>
                <button
                    className={!category ? 'active' : ''}
                    onClick={() => setCategory('')}
                >
                    Все товары <span>{products.length}</span>
                </button>
                {categories.map((item) => (
                    <button
                        className={category === item.id ? 'active' : ''}
                        onClick={() => setCategory(item.id)}
                        key={item.id}
                    >
                        {item.name}
                        <span>
                            {
                                products.filter(
                                    (product) => product.categoryId === item.id,
                                ).length
                            }
                        </span>
                    </button>
                ))}
            </div>
            <div className="filter-group">
                <h3>Производитель</h3>
                {brands.map((brand) => (
                    <label key={brand}>
                        <input
                            type="checkbox"
                            checked={selectedBrands.includes(brand)}
                            onChange={() => toggleBrand(brand)}
                        />
                        <span>{brand}</span>
                    </label>
                ))}
            </div>
            <div className="filter-group">
                <label>
                    <input
                        type="checkbox"
                        checked={stockOnly}
                        onChange={(event) => setStockOnly(event.target.checked)}
                    />
                    <span>Только в наличии</span>
                </label>
            </div>
        </div>
    );
}

export function CatalogPage() {
    const [params, setParams] = useSearchParams();
    const [category, setCategory] = useState(params.get('category') || '');
    const [query, setQuery] = useState(params.get('q') || '');
    const [sort, setSort] = useState(params.get('sort') || 'popular');
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [stockOnly, setStockOnly] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const timer = window.setTimeout(() => setLoading(false), 450);
        return () => window.clearTimeout(timer);
    }, []);
    useEffect(() => {
        const next = new URLSearchParams();
        if (category) next.set('category', category);
        if (query) next.set('q', query);
        if (sort !== 'popular') next.set('sort', sort);
        setParams(next, { replace: true });
    }, [category, query, setParams, sort]);
    const brands = useMemo(
        () => [...new Set(products.map((item) => item.brand))].sort(),
        [],
    );
    const filtered = useMemo(
        () =>
            products
                .filter(
                    (item) =>
                        (!category || item.categoryId === category) &&
                        (!query ||
                            `${item.name} ${item.brand} ${item.sku}`
                                .toLowerCase()
                                .includes(query.toLowerCase())) &&
                        (!selectedBrands.length ||
                            selectedBrands.includes(item.brand)) &&
                        (!stockOnly || item.stock === 'in_stock'),
                )
                .sort((a, b) =>
                    sort === 'price-asc'
                        ? a.price - b.price
                        : sort === 'price-desc'
                          ? b.price - a.price
                          : sort === 'name'
                            ? a.name.localeCompare(b.name, 'ru')
                            : Number(Boolean(b.popular)) -
                              Number(Boolean(a.popular)),
                ),
        [category, query, selectedBrands, sort, stockOnly],
    );
    const reset = () => {
        setCategory('');
        setQuery('');
        setSelectedBrands([]);
        setStockOnly(false);
    };

    return (
        <div className="page container">
            <Breadcrumbs items={[{ label: 'Каталог' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">24 позиции для демонстрации</span>
                    <h1>Каталог оборудования</h1>
                    <p>
                        Кассовая техника, периферия и готовые комплекты с
                        настройкой.
                    </p>
                </div>
            </header>
            <div className="catalog-toolbar">
                <label className="catalog-search">
                    <Search />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Название, бренд или артикул"
                        aria-label="Поиск товаров"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Очистить поиск"
                        >
                            <X />
                        </button>
                    )}
                </label>
                <button
                    className="button button--secondary mobile-filter"
                    onClick={() => setFiltersOpen(true)}
                >
                    <SlidersHorizontal size={18} />
                    Фильтры
                </button>
                <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    aria-label="Сортировка"
                >
                    <option value="popular">Сначала популярные</option>
                    <option value="price-asc">Сначала дешевле</option>
                    <option value="price-desc">Сначала дороже</option>
                    <option value="name">По названию</option>
                </select>
            </div>
            <div className="catalog-layout">
                <aside className="catalog-sidebar">
                    <Filters
                        {...{
                            category,
                            setCategory,
                            brands,
                            selectedBrands,
                            setSelectedBrands,
                            stockOnly,
                            setStockOnly,
                        }}
                    />
                </aside>
                <section className="catalog-results">
                    <div className="results-head">
                        <span>
                            Найдено: <strong>{filtered.length}</strong>
                        </span>
                        {(category ||
                            query ||
                            selectedBrands.length > 0 ||
                            stockOnly) && (
                            <button onClick={reset}>Сбросить фильтры</button>
                        )}
                    </div>
                    {loading ? (
                        <Skeleton count={6} />
                    ) : filtered.length ? (
                        <div className="product-grid product-grid--catalog">
                            {filtered.map((item) => (
                                <ProductCard product={item} key={item.id} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={<Search />}
                            title="Ничего не найдено"
                            text="Попробуйте изменить запрос или сбросить фильтры."
                            action={
                                <button
                                    className="button button--primary"
                                    onClick={reset}
                                >
                                    Сбросить фильтры
                                </button>
                            }
                        />
                    )}
                </section>
            </div>
            <Drawer
                open={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                title="Фильтры каталога"
            >
                <Filters
                    {...{
                        category,
                        setCategory,
                        brands,
                        selectedBrands,
                        setSelectedBrands,
                        stockOnly,
                        setStockOnly,
                    }}
                />
                <button
                    className="button button--primary drawer-apply"
                    onClick={() => setFiltersOpen(false)}
                >
                    Показать {filtered.length} товаров
                </button>
            </Drawer>
        </div>
    );
}
