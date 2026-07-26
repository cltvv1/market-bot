import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ProductVisual } from '../components/ProductVisual';
import { EmptyState, money } from '../components/ui';
import { useCart } from '../context/CartContext';

export function CartPage() {
    const { items, total, update, remove } = useCart();
    if (!items.length)
        return (
            <div className="page container">
                <Breadcrumbs items={[{ label: 'Корзина' }]} />
                <EmptyState
                    icon={<ShoppingBag />}
                    title="Корзина пока пуста"
                    text="Добавьте оборудование из каталога — выбранные товары сохранятся на этом устройстве."
                    action={
                        <Link className="button button--primary" to="/catalog">
                            Перейти в каталог
                        </Link>
                    }
                />
            </div>
        );
    return (
        <div className="page container">
            <Breadcrumbs items={[{ label: 'Корзина' }]} />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Ваш заказ</span>
                    <h1>Корзина</h1>
                    <p>
                        {items.length} позиций — проверьте комплектацию перед
                        оформлением.
                    </p>
                </div>
            </header>
            <div className="cart-layout">
                <section className="cart-list">
                    {items.map(({ product, quantity }) => (
                        <article className="cart-item" key={product.id}>
                            <Link to={`/catalog/${product.slug}`}>
                                <ProductVisual product={product} compact />
                            </Link>
                            <div className="cart-item__info">
                                <span>{product.sku}</span>
                                <Link to={`/catalog/${product.slug}`}>
                                    {product.name}
                                </Link>
                                <p>{product.shortDescription}</p>
                            </div>
                            <div className="quantity">
                                <button
                                    onClick={() =>
                                        update(product.id, quantity - 1)
                                    }
                                    aria-label="Уменьшить количество"
                                >
                                    <Minus />
                                </button>
                                <span>{quantity}</span>
                                <button
                                    onClick={() =>
                                        update(product.id, quantity + 1)
                                    }
                                    aria-label="Увеличить количество"
                                >
                                    <Plus />
                                </button>
                            </div>
                            <strong>{money(product.price * quantity)}</strong>
                            <button
                                className="icon-button"
                                onClick={() => remove(product.id)}
                                aria-label={`Удалить ${product.name}`}
                            >
                                <Trash2 />
                            </button>
                        </article>
                    ))}
                </section>
                <aside className="order-summary">
                    <h2>Ваш заказ</h2>
                    <div>
                        <span>Товары</span>
                        <strong>{money(total)}</strong>
                    </div>
                    <div>
                        <span>Доставка</span>
                        <span>Рассчитаем при оформлении</span>
                    </div>
                    <div className="order-summary__total">
                        <span>Итого</span>
                        <strong>{money(total)}</strong>
                    </div>
                    <Link className="button button--primary" to="/checkout">
                        Перейти к оформлению <ArrowRight />
                    </Link>
                    <p>
                        Для юридических лиц подготовим счёт с НДС и закрывающие
                        документы.
                    </p>
                </aside>
            </div>
        </div>
    );
}
