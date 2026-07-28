import {
    Archive,
    Boxes,
    Monitor,
    PackageCheck,
    Printer,
    ReceiptText,
    Scale,
    ScanBarcode,
    Smartphone,
    Tags,
} from 'lucide-react';
import type { Product } from '../types';

const icons = {
    'online-cash': ReceiptText,
    fiscal: Printer,
    pos: Monitor,
    scanners: ScanBarcode,
    printers: Tags,
    drawers: Archive,
    terminals: Smartphone,
    scales: Scale,
    software: Boxes,
    kits: PackageCheck,
};

export function ProductVisual({
    product,
    compact = false,
}: {
    product: Product;
    compact?: boolean;
}) {
    const Icon =
        icons[product.categoryId as keyof typeof icons] || PackageCheck;
    return (
        <div
            className={`product-visual product-visual--${product.imageTone} ${compact ? 'product-visual--compact' : ''}`}
            role="img"
            aria-label={`${product.name}, демонстрационное изображение`}
        >
            <div className="product-device">
                <Icon aria-hidden="true" strokeWidth={1.25} />
                <span>{product.brand}</span>
            </div>
            <small>{product.sku}</small>
        </div>
    );
}
