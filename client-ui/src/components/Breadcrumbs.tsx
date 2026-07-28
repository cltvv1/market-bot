import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Breadcrumbs({
    items,
}: {
    items: Array<{ label: string; to?: string }>;
}) {
    return (
        <nav className="breadcrumbs" aria-label="Хлебные крошки">
            <Link to="/">Главная</Link>
            {items.map((item) => (
                <span key={item.label}>
                    <ChevronRight size={14} />
                    {item.to ? (
                        <Link to={item.to}>{item.label}</Link>
                    ) : (
                        <span aria-current="page">{item.label}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}
