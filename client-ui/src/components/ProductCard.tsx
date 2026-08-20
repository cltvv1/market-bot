import { ArrowRight, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import type { Product } from '../types';
import { Badge, Button, money } from './ui';
import { ProductVisual } from './ProductVisual';
import styles from './ProductCard.module.css';

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

export function ProductCard({
    product,
    variant = 'desktop',
}: {
    product: Product;
    variant?: 'desktop' | 'compact';
}) {
    const { add } = useCart();
    return (
        <article className={styles.card} data-variant={variant}>
            <Link
                to={`/catalog/${product.slug}`}
                className={styles.visualLink}
                aria-label={`Подробнее: ${product.name}`}
            >
                <ProductVisual
                    product={product}
                    compact={variant === 'compact'}
                />
                {product.oldPrice && (
                    <span className={styles.discount}>
                        −
                        {Math.round(
                            (1 - product.price / product.oldPrice) * 100,
                        )}
                        %
                    </span>
                )}
            </Link>
            <div className={styles.body}>
                <div className={styles.meta}>
                    <Badge tone={stockTone[product.stock]}>
                        {stockLabel[product.stock]}
                    </Badge>
                    <span>{product.sku}</span>
                </div>
                <Link to={`/catalog/${product.slug}`} className={styles.title}>
                    {product.name}
                </Link>
                <p>{product.shortDescription}</p>
                <ul className={styles.features}>
                    {product.features.slice(0, 2).map((feature) => (
                        <li key={feature}>{feature}</li>
                    ))}
                </ul>
            </div>
            <footer className={styles.footer}>
                <div className={styles.price}>
                    <strong>{money(product.price)}</strong>
                    {product.oldPrice && <s>{money(product.oldPrice)}</s>}
                </div>
                <div className={styles.actions}>
                    <Link
                        className={`button button--secondary ${styles.detailsButton}`}
                        to={`/catalog/${product.slug}`}
                    >
                        Подробнее <ArrowRight size={16} />
                    </Link>
                    <Button
                        className={styles.cartButton}
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
