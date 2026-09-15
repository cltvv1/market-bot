import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { Button, Skeleton } from '../components/ui';
import { storeApi } from '../features/store/api';
import { availabilityLabels } from '../features/store/model';
import { Pagination, StoreError } from '../features/store/StoreUI';
import { useStoreRead } from '../features/store/use-store-read';

export function CatalogPage() {
    const [params, setParams] = useSearchParams();
    const search = params.get('search') ?? params.get('q') ?? '';
    const category = params.get('category') ?? '';
    const availability = params.get('availability') ?? '';
    const query = new URLSearchParams({
        page: params.get('page') ?? '1',
        limit: '12',
        ...(search ? { search } : {}),
        ...(category ? { category } : {}),
        ...(availability ? { availability } : {}),
    }).toString();
    const products = useStoreRead(query, (signal) =>
        storeApi.products(query, signal),
    );
    const categories = useStoreRead('categories', storeApi.categories);
    const [input, setInput] = useState(search);
    const dialog = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => setInput(search), [search]);
    function change(name: string, value: string) {
        const next = new URLSearchParams(window.location.search);
        if (!next.has('search') && next.has('q'))
            next.set('search', next.get('q')!);
        if (value) next.set(name, value);
        else next.delete(name);
        next.delete('q');
        next.delete('page');
        setParams(next);
    }
    const filters = (
        <>
            <label className="field">
                <span>Категория</span>
                <select
                    value={category}
                    onChange={(event) => change('category', event.target.value)}
                >
                    <option value="">Все категории</option>
                    {categories.data?.map((item) => (
                        <option key={item.id} value={item.slug}>
                            {item.name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="field">
                <span>Наличие</span>
                <select
                    value={availability}
                    onChange={(event) =>
                        change('availability', event.target.value)
                    }
                >
                    <option value="">Любое наличие</option>
                    {Object.entries(availabilityLabels).map(
                        ([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ),
                    )}
                </select>
            </label>
            <Button variant="ghost" onClick={() => setParams({})}>
                Сбросить фильтры
            </Button>
            {categories.error && (
                <StoreError
                    error={categories.error}
                    retry={() => void categories.refresh()}
                />
            )}
        </>
    );
    return (
        <div className="container store-page">
            <div className="store-heading">
                <div>
                    <Link to="/">Главная</Link>
                    <h1>Каталог оборудования</h1>
                    <p>Итоговые условия и наличие подтвердит менеджер.</p>
                </div>
                <Link className="button button--secondary" to="/orders">
                    Мои заказы
                </Link>
            </div>
            <form
                className="store-search"
                role="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    change('search', input.trim());
                }}
            >
                <input
                    aria-label="Поиск в каталоге"
                    value={input}
                    maxLength={200}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Название, артикул или бренд"
                />
                <Button type="submit">
                    <Search size={18} />
                    Найти
                </Button>
                <button
                    className="button button--secondary store-filter-toggle"
                    type="button"
                    ref={trigger}
                    onClick={() => dialog.current?.showModal()}
                >
                    <SlidersHorizontal size={18} />
                    Фильтры
                </button>
            </form>
            <div className="store-catalog">
                <aside className="store-filters" aria-label="Фильтры каталога">
                    {filters}
                </aside>
                <section className="store-results" aria-label="Товары">
                    {products.loading ? (
                        <Skeleton count={6} />
                    ) : products.error ? (
                        <StoreError
                            error={products.error}
                            retry={() => void products.refresh()}
                        />
                    ) : (
                        products.data && (
                            <>
                                {products.data.items.length ? (
                                    <div className="product-grid">
                                        {products.data.items.map((product) => (
                                            <ProductCard
                                                key={product.id}
                                                product={product}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="store-empty">
                                        По этим условиям товары не найдены.
                                    </p>
                                )}
                                <Pagination page={products.data} />
                            </>
                        )
                    )}
                </section>
            </div>
            <dialog
                className="store-filter-dialog"
                ref={dialog}
                onClose={() => trigger.current?.focus()}
            >
                <header>
                    <h2>Фильтры</h2>
                    <Button
                        variant="ghost"
                        aria-label="Закрыть фильтры"
                        onClick={() => dialog.current?.close()}
                    >
                        <X />
                    </Button>
                </header>
                {filters}
                <Button onClick={() => dialog.current?.close()}>
                    Показать товары
                </Button>
            </dialog>
        </div>
    );
}
