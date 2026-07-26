import { ArrowRight, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import type { Product } from '../types';
import { Badge, Button, money } from './ui';
import { ProductVisual } from './ProductVisual';

const stockLabel = {
    in_stock: 'В наличии',
    low_stock: 'Осталось мало',
    on_order: 'Под заказ',
};
const stockTone = {
    in_stock: 'success',
    low_stock: 'warning',
    on_order: 'neutral',
} as const;

export function ProductCard({ product }: { product: Product }) {
    const { add } = useCart();
    return (
        <article className="product-card">
            <Link
                to={`/catalog/${product.slug}`}
                className="product-card__visual"
                aria-label={`Подробнее: ${product.name}`}
            >
                <ProductVisual product={product} />
                {product.oldPrice && (
                    <span className="discount">
                        −
                        {Math.round(
                            (1 - product.price / product.oldPrice) * 100,
                        )}
                        %
                    </span>
                )}
            </Link>
            <div className="product-card__body">
                <div className="product-card__meta">
                    <Badge tone={stockTone[product.stock]}>
                        {stockLabel[product.stock]}
                    </Badge>
                    <span>{product.sku}</span>
                </div>
                <Link
                    to={`/catalog/${product.slug}`}
                    className="product-card__title"
                >
                    {product.name}
                </Link>
                <p>{product.shortDescription}</p>
                <ul>
                    {product.features.slice(0, 2).map((feature) => (
                        <li key={feature}>{feature}</li>
                    ))}
                </ul>
            </div>
            <footer>
                <div className="price">
                    <strong>{money(product.price)}</strong>
                    {product.oldPrice && <s>{money(product.oldPrice)}</s>}
                </div>
                <div className="product-card__actions">
                    <Link
                        className="button button--secondary"
                        to={`/catalog/${product.slug}`}
                    >
                        Подробнее <ArrowRight size={16} />
                    </Link>
                    <Button
                        onClick={() => add(product.id)}
                        aria-label={`Добавить ${product.name} в корзину`}
                    >
                        <ShoppingCart size={17} />В корзину
                    </Button>
                </div>
            </footer>
        </article>
    );
}
