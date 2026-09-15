import { ShoppingCart } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ProductVisual } from '../components/ProductVisual';
import { Button } from '../components/ui';
import { storeApi } from '../features/store/api';
import {
    availabilityLabels,
    moneyMinor,
    orderable,
} from '../features/store/model';
import { StoreError, StoreLoading } from '../features/store/StoreUI';
import { useStoreRead } from '../features/store/use-store-read';
export function ProductPage() {
    const { slug = '' } = useParams();
    const result = useStoreRead(slug, (signal) =>
        storeApi.product(slug, signal),
    );
    const { add } = useCart();
    const product = result.data;
    return (
        <div className="container store-page">
            <Link to="/catalog">Назад в каталог</Link>
            {result.loading ? (
                <StoreLoading />
            ) : result.error ? (
                <StoreError
                    error={result.error}
                    retry={() => void result.refresh()}
                />
            ) : (
                product && (
                    <>
                        <div className="store-product-detail">
                            <ProductVisual />
                            <section>
                                <Link
                                    to={`/catalog?category=${product.category.slug}`}
                                >
                                    {product.category.name}
                                </Link>
                                <h1>{product.name}</h1>
                                <p className="store-muted">
                                    Артикул {product.sku}
                                    {product.brand ? ` · ${product.brand}` : ''}
                                </p>
                                <div className="store-tags">
                                    <span className="store-badge">
                                        {
                                            availabilityLabels[
                                                product.availabilityStatus
                                            ]
                                        }
                                    </span>
                                    {product.isNew && (
                                        <span className="store-badge">
                                            Новинка
                                        </span>
                                    )}
                                    {product.isPopular && (
                                        <span className="store-badge">
                                            Популярное
                                        </span>
                                    )}
                                </div>
                                <p>{product.shortDescription}</p>
                                <h2>{moneyMinor(product.displayPriceMinor)}</h2>
                                <p className="store-muted">
                                    НДС: {product.vatRate / 100}%
                                </p>
                                <Button
                                    disabled={!orderable(product)}
                                    onClick={() => add(product.id)}
                                >
                                    <ShoppingCart size={18} />В корзину
                                </Button>
                                <p className="store-muted">
                                    Наличие и окончательную стоимость подтвердит
                                    менеджер перед выставлением счёта.
                                </p>
                            </section>
                        </div>
                        <section className="store-section">
                            <h2>Описание</h2>
                            <p className="store-text">
                                {product.description ||
                                    'Описание пока не добавлено.'}
                            </p>
                            {product.features.length > 0 && (
                                <ul>
                                    {product.features.map((value, index) => (
                                        <li key={index}>{value}</li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        {Object.keys(product.specifications).length > 0 && (
                            <section className="store-section">
                                <h2>Характеристики</h2>
                                <dl className="store-facts">
                                    {Object.entries(product.specifications).map(
                                        ([key, value]) => (
                                            <div key={key}>
                                                <dt>{key}</dt>
                                                <dd>{value}</dd>
                                            </div>
                                        ),
                                    )}
                                </dl>
                            </section>
                        )}
                        {product.packageContents.length > 0 && (
                            <section className="store-section">
                                <h2>Комплектация</h2>
                                <ul>
                                    {product.packageContents.map(
                                        (value, index) => (
                                            <li key={index}>{value}</li>
                                        ),
                                    )}
                                </ul>
                            </section>
                        )}
                    </>
                )
            )}
        </div>
    );
}
