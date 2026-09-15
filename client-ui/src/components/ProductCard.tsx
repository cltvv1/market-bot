import { ArrowRight, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import type { Product } from '../features/store/types';
import {
    availabilityLabels,
    moneyMinor,
    orderable,
} from '../features/store/model';
import { Button } from './ui';
import { ProductVisual } from './ProductVisual';
export function ProductCard({ product }: { product: Product }) {
    const { add } = useCart();
    return (
        <article className="product-card store-product-card">
            <Link
                to={`/catalog/${product.slug}`}
                aria-label={`Подробнее: ${product.name}`}
            >
                <ProductVisual />
            </Link>
            <div className="product-card__body">
                <div className="product-card__meta">
                    <span className="store-badge">
                        {availabilityLabels[product.availabilityStatus]}
                    </span>
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
                    {product.features.slice(0, 2).map((feature, index) => (
                        <li key={index}>{feature}</li>
                    ))}
                </ul>
            </div>
            <footer>
                <div className="price">
                    <strong>{moneyMinor(product.displayPriceMinor)}</strong>
                </div>
                <div className="product-card__actions">
                    <Link
                        className="button button--secondary"
                        to={`/catalog/${product.slug}`}
                    >
                        Подробнее <ArrowRight size={16} />
                    </Link>
                    <Button
                        disabled={!orderable(product)}
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
