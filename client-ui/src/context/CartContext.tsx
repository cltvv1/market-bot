import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { products } from '../data/catalog';
import type { CartLine, Product } from '../types';

interface CartContextValue {
    lines: CartLine[];
    items: Array<{ product: Product; quantity: number }>;
    count: number;
    total: number;
    add: (productId: string, quantity?: number) => void;
    update: (productId: string, quantity: number) => void;
    remove: (productId: string) => void;
    clear: () => void;
    notice: string;
    notify: (message: string) => void;
}

const STORAGE_KEY = 'vitma_cart';
const CartContext = createContext<CartContextValue | null>(null);

const loadCart = (): CartLine[] => {
    try {
        return JSON.parse(
            localStorage.getItem(STORAGE_KEY) || '[]',
        ) as CartLine[];
    } catch {
        return [];
    }
};

export function CartProvider({ children }: { children: ReactNode }) {
    const [lines, setLines] = useState<CartLine[]>(loadCart);
    const [notice, setNotice] = useState('');

    useEffect(
        () => localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)),
        [lines],
    );
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(''), 2600);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const notify = useCallback((message: string) => setNotice(message), []);
    const add = useCallback((productId: string, quantity = 1) => {
        setLines((current) => {
            const existing = current.find(
                (line) => line.productId === productId,
            );
            return existing
                ? current.map((line) =>
                      line.productId === productId
                          ? { ...line, quantity: line.quantity + quantity }
                          : line,
                  )
                : [...current, { productId, quantity }];
        });
        setNotice('Товар добавлен в корзину');
    }, []);
    const update = useCallback((productId: string, quantity: number) => {
        if (quantity <= 0)
            setLines((current) =>
                current.filter((line) => line.productId !== productId),
            );
        else
            setLines((current) =>
                current.map((line) =>
                    line.productId === productId ? { ...line, quantity } : line,
                ),
            );
    }, []);
    const remove = useCallback(
        (productId: string) =>
            setLines((current) =>
                current.filter((line) => line.productId !== productId),
            ),
        [],
    );
    const clear = useCallback(() => setLines([]), []);

    const value = useMemo(() => {
        const items = lines.flatMap((line) => {
            const product = products.find(
                (candidate) => candidate.id === line.productId,
            );
            return product ? [{ product, quantity: line.quantity }] : [];
        });
        return {
            lines,
            items,
            count: items.reduce((sum, item) => sum + item.quantity, 0),
            total: items.reduce(
                (sum, item) => sum + item.product.price * item.quantity,
                0,
            ),
            add,
            update,
            remove,
            clear,
            notice,
            notify,
        };
    }, [add, clear, lines, notice, notify, remove, update]);

    return (
        <CartContext.Provider value={value}>{children}</CartContext.Provider>
    );
}

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used inside CartProvider');
    return context;
};
