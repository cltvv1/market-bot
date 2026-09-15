import { Package } from 'lucide-react';
export function ProductVisual({ compact = false }: { compact?: boolean }) {
    return (
        <div
            className={`store-placeholder ${compact ? 'store-placeholder--compact' : ''}`}
            role="img"
            aria-label="Фотография товара не добавлена"
        >
            <Package
                size={compact ? 30 : 64}
                strokeWidth={1.2}
                aria-hidden="true"
            />
            <span>Без фотографии</span>
        </div>
    );
}
