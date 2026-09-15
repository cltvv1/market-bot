import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    CART_KEY,
    integer,
    LINE_MAX,
    parseCart,
    QUANTITY_MAX,
} from '../features/store/model';
import type { CartLine } from '../features/store/types';

interface CartContextValue {
    lines: CartLine[];
    count: number;
    add: (productId: number, quantity?: number) => void;
    update: (productId: number, quantity: number) => void;
    remove: (productId: number) => void;
    clear: () => void;
    notice: string;
    notify: (message: string) => void;
}
const CartContext = createContext<CartContextValue | null>(null);
function loadCart() {
    try {
        return parseCart(localStorage.getItem(CART_KEY));
    } catch {
        return [];
    }
}
export function CartProvider({ children }: { children: ReactNode }) {
    const [lines, setLines] = useState<CartLine[]>(loadCart);
    const [notice, setNotice] = useState('');
    useEffect(() => {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(lines));
        } catch {
            setNotice(
                'Корзина доступна в этой вкладке, но браузер не разрешил её сохранить.',
            );
        }
    }, [lines]);
    useEffect(() => {
        const changed = (event: StorageEvent) => {
            if (event.key === CART_KEY || event.key === null)
                setLines(loadCart());
        };
        window.addEventListener('storage', changed);
        return () => window.removeEventListener('storage', changed);
    }, []);
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(''), 4000);
        return () => window.clearTimeout(timer);
    }, [notice]);
    const notify = useCallback((message: string) => setNotice(message), []);
    const add = useCallback((productId: number, quantity = 1) => {
        if (!integer(productId) || !integer(quantity, QUANTITY_MAX)) return;
        setLines((current) => {
            const existing = current.find(
                (line) => line.productId === productId,
            );
            if (existing)
                return current.map((line) =>
                    line.productId === productId
                        ? {
                              productId,
                              quantity: Math.min(
                                  QUANTITY_MAX,
                                  line.quantity + quantity,
                              ),
                          }
                        : line,
                );
            return current.length < LINE_MAX
                ? [...current, { productId, quantity }]
                : current;
        });
        setNotice(
            'Корзина обновлена. Не более 100 позиций и 1000 единиц в каждой.',
        );
    }, []);
    const update = useCallback((productId: number, quantity: number) => {
        if (integer(productId) && integer(quantity, QUANTITY_MAX))
            setLines((current) =>
                current.map((line) =>
                    line.productId === productId
                        ? { productId, quantity }
                        : line,
                ),
            );
    }, []);
    const remove = useCallback(
        (productId: number) =>
            setLines((current) =>
                current.filter((line) => line.productId !== productId),
            ),
        [],
    );
    const clear = useCallback(() => setLines([]), []);
    const value = useMemo(
        () => ({
            lines,
            count: lines.reduce((sum, line) => sum + line.quantity, 0),
            add,
            update,
            remove,
            clear,
            notice,
            notify,
        }),
        [lines, add, update, remove, clear, notice, notify],
    );
    return (
        <CartContext.Provider value={value}>{children}</CartContext.Provider>
    );
}
export function useCart() {
    const value = useContext(CartContext);
    if (!value) throw new Error('useCart must be used inside CartProvider');
    return value;
}
