import {
    Check,
    ChevronLeft,
    ChevronRight,
    Minus,
    Plus,
    ShieldCheck,
    ShoppingCart,
    Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ProductCard } from '../components/ProductCard';
import { ProductVisual } from '../components/ProductVisual';
import { Badge, Button, EmptyState, money } from '../components/ui';
import { useCart } from '../context/CartContext';
import { getCategory, getProduct, products } from '../data/catalog';

export function ProductPage() {
    const { slug } = useParams();
    const product = getProduct(slug);
    const { add } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [gallery, setGallery] = useState(0);
    const [tab, setTab] = useState('description');
    if (!product)
        return (
            <div className="page container">
                <EmptyState
                    icon={<ShoppingCart />}
                    title="Товар не найден"
                    text="Возможно, ссылка устарела."
                    action={
                        <Link className="button button--primary" to="/catalog">
                            Вернуться в каталог
                        </Link>
                    }
                />
            </div>
        );
    const category = getCategory(product.categoryId);
    const related = products
        .filter(
            (item) =>
                item.categoryId === product.categoryId &&
                item.id !== product.id,
        )
        .slice(0, 4);
    const galleryLabels = ['Общий вид', 'Вид сбоку', 'Комплект поставки'];
    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Каталог', to: '/catalog' },
                    {
                        label: category?.name || 'Товар',
                        to: `/catalog?category=${product.categoryId}`,
                    },
                    { label: product.name },
                ]}
            />
            <section className="product-detail">
                <div className="gallery">
                    <div className={`gallery-main gallery-main--${gallery}`}>
                        <ProductVisual product={product} />
                        <button
                            className="gallery-prev"
                            onClick={() => setGallery((gallery + 2) % 3)}
                            aria-label="Предыдущее изображение"
                        >
                            <ChevronLeft />
                        </button>
                        <button
                            className="gallery-next"
                            onClick={() => setGallery((gallery + 1) % 3)}
                            aria-label="Следующее изображение"
                        >
                            <ChevronRight />
                        </button>
                    </div>
                    <div className="gallery-thumbs">
                        {galleryLabels.map((label, index) => (
                            <button
                                className={gallery === index ? 'active' : ''}
                                onClick={() => setGallery(index)}
                                key={label}
                            >
                                <ProductVisual product={product} compact />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="product-info">
                    <div className="product-info__meta">
                        <Badge
                            tone={
                                product.stock === 'in_stock'
                                    ? 'success'
                                    : product.stock === 'low_stock'
                                      ? 'warning'
                                      : 'neutral'
                            }
                        >
                            {product.stock === 'in_stock'
                                ? 'В наличии'
                                : product.stock === 'low_stock'
                                  ? 'Осталось мало'
                                  : 'Под заказ'}
                        </Badge>
                        <span>Артикул: {product.sku}</span>
                    </div>
                    <h1>{product.name}</h1>
                    <p className="product-lead">{product.shortDescription}</p>
                    <ul className="feature-list">
                        {product.features.map((feature) => (
                            <li key={feature}>
                                <Check /> {feature}
                            </li>
                        ))}
                    </ul>
                    <div className="buy-panel">
                        <div className="price price--large">
                            <strong>{money(product.price)}</strong>
                            {product.oldPrice && (
                                <s>{money(product.oldPrice)}</s>
                            )}
                        </div>
                        <div className="quantity">
                            <button
                                onClick={() =>
                                    setQuantity(Math.max(1, quantity - 1))
                                }
                                aria-label="Уменьшить количество"
                            >
                                <Minus />
                            </button>
                            <span>{quantity}</span>
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                aria-label="Увеличить количество"
                            >
                                <Plus />
                            </button>
                        </div>
                        <Button onClick={() => add(product.id, quantity)}>
                            <ShoppingCart />
                            Добавить в корзину
                        </Button>
                        <Link
                            className="button button--secondary"
                            to={`/service/request?product=${product.slug}`}
                        >
                            <Wrench />
                            Нужна консультация
                        </Link>
                    </div>
                    <div className="purchase-notes">
                        <span>
                            <ShieldCheck />
                            Официальная гарантия
                        </span>
                        <span>
                            <ShoppingCart />
                            Счёт для организации
                        </span>
                    </div>
                </div>
            </section>
            <section className="product-tabs">
                <div className="tabs" role="tablist">
                    {[
                        ['description', 'Описание'],
                        ['specs', 'Характеристики'],
                        ['package', 'Комплектация'],
                        ['delivery', 'Доставка и оплата'],
                    ].map(([id, label]) => (
                        <button
                            role="tab"
                            aria-selected={tab === id}
                            className={tab === id ? 'active' : ''}
                            onClick={() => setTab(id)}
                            key={id}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="tab-panel">
                    {tab === 'description' && (
                        <>
                            <h2>О товаре</h2>
                            <p>{product.description}</p>
                            <p>
                                Перед отгрузкой специалисты VITMA MARKET
                                проверяют оборудование и при необходимости
                                выполняют первичную настройку.
                            </p>
                        </>
                    )}
                    {tab === 'specs' && (
                        <>
                            <h2>Характеристики</h2>
                            <dl className="spec-list">
                                {Object.entries(product.specifications).map(
                                    ([key, value]) => (
                                        <div key={key}>
                                            <dt>{key.replace('_', ' ')}</dt>
                                            <dd>{value}</dd>
                                        </div>
                                    ),
                                )}
                            </dl>
                        </>
                    )}
                    {tab === 'package' && (
                        <>
                            <h2>Комплектация</h2>
                            <ul className="package-list">
                                {product.packageContents.map((item) => (
                                    <li key={item}>
                                        <Check />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {tab === 'delivery' && (
                        <>
                            <h2>Доставка и оплата</h2>
                            <p>
                                Самовывоз из офиса в Красноярске, доставка по
                                городу или отправка транспортной компанией. Для
                                организаций подготовим счёт и закрывающие
                                документы.
                            </p>
                            <Link to="/delivery">
                                Подробные условия доставки
                            </Link>
                        </>
                    )}
                </div>
            </section>
            {related.length > 0 && (
                <section className="related">
                    <div className="section-heading">
                        <div>
                            <span className="eyebrow">Может подойти</span>
                            <h2>Похожие товары</h2>
                        </div>
                    </div>
                    <div className="product-grid">
                        {related.map((item) => (
                            <ProductCard product={item} key={item.id} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
