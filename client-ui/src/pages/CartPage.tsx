import { ArrowRight, Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductVisual } from '../components/ProductVisual';
import { Button } from '../components/ui';
import { useHydratedCart } from '../features/store/cart/use-hydrated-cart';
import {
    availabilityLabels,
    moneyMinor,
    QUANTITY_MAX,
} from '../features/store/model';
import { StoreError, StoreLoading } from '../features/store/StoreUI';
export function CartPage() {
    const cart = useHydratedCart();
    return (
        <div className="container store-page">
            <div className="store-heading">
                <h1>Корзина</h1>
                <Button
                    variant="secondary"
                    disabled={cart.loading}
                    onClick={() => void cart.refresh()}
                >
                    <RefreshCw size={16} />
                    Обновить цены
                </Button>
            </div>
            {!!cart.error && (
                <StoreError
                    error={cart.error}
                    retry={() => void cart.refresh()}
                />
            )}
            {cart.loading ? (
                <StoreLoading />
            ) : !cart.lines.length ? (
                <div className="store-empty">
                    <p>В корзине пока нет товаров.</p>
                    <Link className="button button--primary" to="/catalog">
                        В каталог <ArrowRight size={18} />
                    </Link>
                </div>
            ) : (
                <>
                    <div className="store-cart-lines">
                        {cart.items.map(({ productId, product, quantity }) => (
                            <article
                                className="store-cart-line"
                                key={productId}
                            >
                                <ProductVisual compact />
                                <div>
                                    {product ? (
                                        <>
                                            <Link
                                                to={`/catalog/${product.slug}`}
                                            >
                                                {product.name}
                                            </Link>
                                            <p>
                                                {product.sku} ·{' '}
                                                {
                                                    availabilityLabels[
                                                        product
                                                            .availabilityStatus
                                                    ]
                                                }
                                            </p>
                                            <strong>
                                                {moneyMinor(
                                                    product.displayPriceMinor,
                                                )}
                                            </strong>
                                        </>
                                    ) : (
                                        <>
                                            <strong>
                                                Товар больше недоступен
                                            </strong>
                                            <p>
                                                Позиция #{productId}. Удалите
                                                её, чтобы оформить заказ.
                                            </p>
                                        </>
                                    )}
                                </div>
                                <div className="store-quantity">
                                    <Button
                                        variant="ghost"
                                        aria-label={`Уменьшить количество позиции ${productId}`}
                                        disabled={quantity <= 1}
                                        onClick={() =>
                                            cart.update(productId, quantity - 1)
                                        }
                                    >
                                        <Minus size={16} />
                                    </Button>
                                    <input
                                        aria-label={`Количество позиции ${productId}`}
                                        type="number"
                                        min={1}
                                        max={QUANTITY_MAX}
                                        step={1}
                                        value={quantity}
                                        onChange={(event) =>
                                            cart.update(
                                                productId,
                                                Number(event.target.value),
                                            )
                                        }
                                    />
                                    <Button
                                        variant="ghost"
                                        aria-label={`Увеличить количество позиции ${productId}`}
                                        disabled={quantity >= QUANTITY_MAX}
                                        onClick={() =>
                                            cart.update(productId, quantity + 1)
                                        }
                                    >
                                        <Plus size={16} />
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    aria-label={`Удалить позицию ${productId}`}
                                    onClick={() => cart.remove(productId)}
                                >
                                    <Trash2 size={19} />
                                </Button>
                            </article>
                        ))}
                    </div>
                    <section className="store-cart-total">
                        <div>
                            <span>
                                {cart.totals.unpriced
                                    ? 'Сумма позиций с указанной ценой'
                                    : 'Сумма по каталогу'}
                            </span>
                            <h2>{moneyMinor(cart.totals.subtotal)}</h2>
                            {cart.totals.unpriced && (
                                <p>
                                    Некоторые позиции требуют расчёта
                                    менеджером.
                                </p>
                            )}
                            <p className="store-muted">
                                Стоимость и наличие подтвердит менеджер.
                            </p>
                        </div>
                        {cart.totals.blocked || cart.error ? (
                            <p role="status">
                                Оформление недоступно. Обновите корзину или
                                удалите недоступные позиции.
                            </p>
                        ) : (
                            <Link
                                className="button button--primary"
                                to="/checkout"
                            >
                                Оформить заказ <ArrowRight size={18} />
                            </Link>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
