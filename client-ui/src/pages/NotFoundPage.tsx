import { SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
    return (
        <div className="page container">
            <EmptyState
                icon={<SearchX />}
                title="Страница не найдена"
                text="Возможно, адрес изменился или страница была удалена."
                action={
                    <div>
                        <Link className="button button--primary" to="/">
                            На главную
                        </Link>
                        <Link
                            className="button button--secondary"
                            to="/catalog"
                        >
                            В каталог
                        </Link>
                    </div>
                }
            />
        </div>
    );
}
