import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState } from '../../app/primitives';
import { fmtDate } from '../../format';
import {
    catalogRoot,
    productsPath,
    categoriesPath,
    queueQuery,
    priceLabel,
} from './api';
import {
    availabilityLabels,
    CATALOG_AVAILABILITY_STATUSES,
    type CatalogCategory,
    type ProductList,
} from './types';

export function CatalogProductQueuePage() {
    const [params, setParams] = useSearchParams();
    const { admin, revision } = useSession();
    const query = queueQuery(params);
    const queryText = query.toString();
    const result = useRead<ProductList>(
        `${catalogRoot}/products?${queryText}`,
        revision,
    );
    const categories = useRead<CatalogCategory[]>(
        `${catalogRoot}/categories`,
        revision,
    );
    const change = (key: string, value: string) => {
        const next = new URLSearchParams(query);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('limit');
        if (key !== 'page') next.delete('page');
        setParams(next);
    };
    return (
        <section className="cat-workspace">
            <header className="cat-heading">
                <div>
                    <p className="cat-eyebrow">Каталог</p>
                    <h1>Товары</h1>
                </div>
                <div className="admin-actions">
                    <Link className="admin-button" to={categoriesPath}>
                        Категории
                    </Link>
                    {admin.permissions.includes('catalog.manage') && (
                        <Link
                            className="admin-button admin-button--primary"
                            to={`${productsPath}/new`}
                        >
                            <Plus size={17} />
                            Добавить товар
                        </Link>
                    )}
                </div>
            </header>
            <form
                className="cat-filters"
                onSubmit={(e) => {
                    e.preventDefault();
                    const value = new FormData(e.currentTarget).get('search');
                    change('search', typeof value === 'string' ? value : '');
                }}
            >
                <label className="cat-search">
                    Название, SKU или поисковое название
                    <div>
                        <input
                            name="search"
                            key={query.get('search') || ''}
                            defaultValue={query.get('search') || ''}
                            maxLength={100}
                        />
                        <button
                            className="admin-icon-button"
                            aria-label="Найти товары"
                            title="Найти"
                        >
                            <Search size={18} />
                        </button>
                    </div>
                </label>
                <label>
                    Категория
                    <select
                        aria-label="Категория"
                        value={query.get('category') || ''}
                        onChange={(e) => change('category', e.target.value)}
                    >
                        <option value="">Все категории</option>
                        {categories.data?.map((item) => (
                            <option key={item.id} value={item.slug}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Доступность
                    <select
                        aria-label="Доступность"
                        value={query.get('availability') || ''}
                        onChange={(e) => change('availability', e.target.value)}
                    >
                        <option value="">Любая</option>
                        {CATALOG_AVAILABILITY_STATUSES.map((item) => (
                            <option key={item} value={item}>
                                {availabilityLabels[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Активность
                    <select
                        aria-label="Активность"
                        value={query.get('active') || ''}
                        onChange={(e) => change('active', e.target.value)}
                    >
                        <option value="">Любая</option>
                        <option value="active">Активные</option>
                        <option value="inactive">Неактивные</option>
                    </select>
                </label>
                <label>
                    Публикация
                    <select
                        aria-label="Публикация"
                        value={query.get('publication') || ''}
                        onChange={(e) => change('publication', e.target.value)}
                    >
                        <option value="">Любая</option>
                        <option value="published">Опубликованные</option>
                        <option value="unpublished">Черновики</option>
                    </select>
                </label>
            </form>
            {!!categories.error && (
                <p role="alert">
                    Не удалось загрузить категории.{' '}
                    <button className="admin-button" onClick={categories.retry}>
                        Повторить
                    </button>
                </p>
            )}
            {!result.data ? (
                <ReadState {...result} />
            ) : (
                <>
                    <div className="cat-result-count" role="status">
                        Товаров: {result.data.total}
                        {result.loading ? ' · Обновление…' : ''}
                    </div>
                    <div className="cat-table-wrap">
                        <table className="cat-table">
                            <thead>
                                <tr>
                                    <th>Товар / SKU</th>
                                    <th>Категория / бренд</th>
                                    <th>Цена / НДС</th>
                                    <th>Доступность</th>
                                    <th>Публикация</th>
                                    <th>Обновлён</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.data.items.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <Link
                                                className="cat-product-link"
                                                to={`${productsPath}/${item.id}`}
                                                state={{
                                                    queueUrl: `${productsPath}?${queryText}`,
                                                }}
                                            >
                                                {item.name}
                                            </Link>
                                            <span>
                                                #{item.id} · {item.sku}
                                            </span>
                                            {(item.isPopular || item.isNew) && (
                                                <span>
                                                    {[
                                                        item.isPopular &&
                                                            'Популярный',
                                                        item.isNew && 'Новинка',
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {item.category.name}
                                            <span>
                                                {item.brand || 'Без бренда'}
                                            </span>
                                        </td>
                                        <td>
                                            {priceLabel(item.displayPriceMinor)}
                                            <span>
                                                НДС {item.vatRate / 100}%
                                            </span>
                                        </td>
                                        <td>
                                            {
                                                availabilityLabels[
                                                    item.availabilityStatus
                                                ]
                                            }
                                            <span>
                                                {item.isActive
                                                    ? 'Активен'
                                                    : 'Неактивен'}
                                            </span>
                                        </td>
                                        <td>
                                            {item.isPublished
                                                ? 'Опубликован'
                                                : 'Черновик'}
                                            <span>
                                                {item.effectivePublicVisibility
                                                    ? 'Публично виден'
                                                    : item.isPublished &&
                                                        !item.category
                                                            .isPublished
                                                      ? 'Категория скрыта'
                                                      : 'Публично не виден'}
                                            </span>
                                        </td>
                                        <td>{fmtDate(item.updatedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!result.data.items.length && (
                        <div className="admin-state">
                            <h2>Товары не найдены</h2>
                            <button
                                className="admin-button"
                                onClick={() => setParams({})}
                            >
                                Сбросить фильтры
                            </button>
                        </div>
                    )}
                    <nav
                        className="cat-pagination"
                        aria-label="Страницы каталога"
                    >
                        <button
                            className="admin-icon-button"
                            aria-label="Предыдущая страница"
                            title="Предыдущая страница"
                            disabled={result.data.page <= 1 || result.loading}
                            onClick={() =>
                                change('page', String(result.data!.page - 1))
                            }
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span>
                            Страница {result.data.page} из{' '}
                            {Math.max(1, result.data.totalPages)}
                        </span>
                        <button
                            className="admin-icon-button"
                            aria-label="Следующая страница"
                            title="Следующая страница"
                            disabled={
                                result.data.page >= result.data.totalPages ||
                                result.loading
                            }
                            onClick={() =>
                                change('page', String(result.data!.page + 1))
                            }
                        >
                            <ChevronRight size={18} />
                        </button>
                    </nav>
                </>
            )}
        </section>
    );
}
