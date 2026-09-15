import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { ServiceCard } from '../components/ServiceCard';
import { Button } from '../components/ui';
import { serviceDirections } from '../data/services';
import { storeApi } from '../features/store/api';
import { StoreError, StoreLoading } from '../features/store/StoreUI';
import { useStoreRead } from '../features/store/use-store-read';
export function SearchPage() {
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const [input, setInput] = useState(query);
    useEffect(() => setInput(query), [query]);
    const products = useStoreRead(query || null, (signal) =>
        storeApi.products(
            new URLSearchParams({
                search: query,
                limit: '8',
                page: '1',
            }).toString(),
            signal,
        ),
    );
    const services = query.trim()
        ? serviceDirections.filter((service) =>
              `${service.title} ${service.description}`
                  .toLocaleLowerCase('ru-RU')
                  .includes(query.trim().toLocaleLowerCase('ru-RU')),
          )
        : [];
    return (
        <div className="container store-page">
            <h1>Поиск по VITMA MARKET</h1>
            <form
                className="store-search"
                role="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    setParams({ q: input.trim() });
                }}
            >
                <input
                    aria-label="Поиск по товарам и услугам"
                    maxLength={200}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                />
                <Button type="submit">
                    <Search size={18} />
                    Найти
                </Button>
            </form>
            {query && (
                <section className="store-section">
                    <div className="store-heading">
                        <h2>Оборудование</h2>
                        <Link
                            to={`/catalog?search=${encodeURIComponent(query)}`}
                        >
                            Открыть весь результат в каталоге
                        </Link>
                    </div>
                    {products.loading ? (
                        <StoreLoading />
                    ) : products.error ? (
                        <StoreError
                            error={products.error}
                            retry={() => void products.refresh()}
                        />
                    ) : (
                        products.data && (
                            <>
                                <p>Найдено товаров: {products.data.total}</p>
                                <div className="product-grid">
                                    {products.data.items.map((product) => (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                        />
                                    ))}
                                </div>
                            </>
                        )
                    )}
                </section>
            )}
            {!!services.length && (
                <section className="store-section">
                    <h2>Услуги</h2>
                    <div className="service-grid">
                        {services.map((service) => (
                            <ServiceCard key={service.id} service={service} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
