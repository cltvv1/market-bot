import { useState } from 'react';
import { Plus, Search, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { money, minorFromInput, priceInput } from './api';

export interface EditedLine {
    productId: number;
    name: string;
    quantity: string;
    price: string;
}
interface Products {
    items: Array<{
        id: number;
        name: string;
        sku: string;
        displayPriceMinor: number | null;
        isActive: boolean;
        availabilityStatus: string;
    }>;
    page: number;
    totalPages: number;
}
export function OrderQuoteEditor({
    lines,
    onChange,
}: {
    lines: EditedLine[];
    onChange: (lines: EditedLine[]) => void;
}) {
    const { admin } = useSession();
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const products = useRead<Products>(
        query !== null && admin.permissions.includes('catalog.read')
            ? `/admin/api/catalog/products?${new URLSearchParams({ search: query, page: String(page), limit: '10' })}`
            : null,
    );
    const update = (
        index: number,
        field: 'price' | 'quantity',
        value: string,
    ) =>
        onChange(
            lines.map((line, i) =>
                i === index ? { ...line, [field]: value } : line,
            ),
        );
    let total: string | null = null;
    try {
        total = lines
            .reduce((sum, line) => {
                const price = minorFromInput(line.price);
                if (price === null || !/^\d+$/.test(line.quantity))
                    throw new Error();
                return sum + BigInt(price) * BigInt(line.quantity);
            }, 0n)
            .toString();
    } catch {
        /* Incomplete fields have no agreed total. */
    }
    return (
        <div className="ord-quote-editor">
            <div className="ord-edit-lines">
                {lines.map((line, index) => (
                    <div key={line.productId} className="ord-edit-line">
                        <strong>{line.name}</strong>
                        <label>
                            Количество
                            <input
                                inputMode="numeric"
                                aria-label={`Количество: ${line.name}`}
                                value={line.quantity}
                                onChange={(e) =>
                                    update(index, 'quantity', e.target.value)
                                }
                                required
                            />
                        </label>
                        <label>
                            Цена, ₽
                            <input
                                inputMode="decimal"
                                aria-label={`Цена: ${line.name}`}
                                value={line.price}
                                onChange={(e) =>
                                    update(index, 'price', e.target.value)
                                }
                            />
                        </label>
                        <button
                            type="button"
                            className="admin-icon-button"
                            aria-label={`Удалить: ${line.name}`}
                            onClick={() =>
                                onChange(lines.filter((_, i) => i !== index))
                            }
                        >
                            <Trash2 size={17} />
                        </button>
                    </div>
                ))}
            </div>
            <p className="ord-total">
                Итого <strong>{money(total)}</strong>
            </p>
            {admin.permissions.includes('catalog.read') && (
                <>
                    <div className="ord-search">
                        <label>
                            Добавить позицию
                            <input
                                value={search}
                                maxLength={100}
                                placeholder="Название или артикул"
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setQuery(search.trim());
                                        setPage(1);
                                    }
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            className="admin-icon-button"
                            aria-label="Найти позиции"
                            onClick={() => {
                                setQuery(search.trim());
                                setPage(1);
                            }}
                        >
                            <Search size={18} />
                        </button>
                    </div>
                    {products.loading && <p role="status">Поиск…</p>}
                    {products.error && (
                        <p role="alert">
                            Каталог недоступен.{' '}
                            <button
                                type="button"
                                className="admin-button"
                                onClick={products.retry}
                            >
                                Повторить
                            </button>
                        </p>
                    )}
                    {products.data && (
                        <>
                            <ul className="ord-products">
                                {products.data.items.map((product) => (
                                    <li key={product.id}>
                                        <span>
                                            {product.name}
                                            <small>{product.sku}</small>
                                        </span>
                                        <button
                                            type="button"
                                            className="admin-icon-button"
                                            aria-label={`Добавить: ${product.name}`}
                                            disabled={
                                                products.loading ||
                                                !product.isActive ||
                                                product.availabilityStatus ===
                                                    'unavailable' ||
                                                lines.some(
                                                    (line) =>
                                                        line.productId ===
                                                        product.id,
                                                ) ||
                                                lines.length >= 100
                                            }
                                            onClick={() =>
                                                onChange([
                                                    ...lines,
                                                    {
                                                        productId: product.id,
                                                        name: product.name,
                                                        quantity: '1',
                                                        price: priceInput(
                                                            product.displayPriceMinor ===
                                                                null
                                                                ? null
                                                                : String(
                                                                      product.displayPriceMinor,
                                                                  ),
                                                        ),
                                                    },
                                                ])
                                            }
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {!products.data.items.length && (
                                <p>Позиции не найдены</p>
                            )}
                            <div className="ord-pagination">
                                <span>
                                    {products.data.page} /{' '}
                                    {Math.max(1, products.data.totalPages)}
                                </span>
                                <button
                                    type="button"
                                    className="admin-icon-button"
                                    aria-label="Предыдущие позиции"
                                    disabled={page <= 1 || products.loading}
                                    onClick={() => setPage(page - 1)}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    type="button"
                                    className="admin-icon-button"
                                    aria-label="Следующие позиции"
                                    disabled={
                                        page >= products.data.totalPages ||
                                        products.loading
                                    }
                                    onClick={() => setPage(page + 1)}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
