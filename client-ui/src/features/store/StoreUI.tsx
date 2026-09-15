import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button, Loader } from '../../components/ui';
import { storeError } from './api';
import type { Page } from './types';
export function StoreError({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    return (
        <div className="store-error" role="alert">
            <p>{storeError(error)}</p>
            {retry && (
                <Button variant="secondary" onClick={retry}>
                    <RefreshCw size={16} />
                    Проверить снова
                </Button>
            )}
        </div>
    );
}
export function StoreLoading() {
    return <Loader label="Получаем актуальные данные" />;
}
export function Pagination({
    page,
}: {
    page: Pick<Page<unknown>, 'page' | 'totalPages' | 'total'>;
}) {
    const [, setParams] = useSearchParams();
    function navigate(value: number) {
        const next = new URLSearchParams(window.location.search);
        next.set('page', String(value));
        setParams(next);
    }
    return (
        <nav className="store-pagination" aria-label="Страницы">
            <Button
                variant="secondary"
                aria-label="Предыдущая страница"
                disabled={page.page <= 1}
                onClick={() => navigate(page.page - 1)}
            >
                <ArrowLeft size={18} />
            </Button>
            <span>
                Страница {page.page} из {Math.max(1, page.totalPages)} · Всего{' '}
                {page.total}
            </span>
            <Button
                variant="secondary"
                aria-label="Следующая страница"
                disabled={page.page >= page.totalPages}
                onClick={() => navigate(page.page + 1)}
            >
                <ArrowRight size={18} />
            </Button>
        </nav>
    );
}
