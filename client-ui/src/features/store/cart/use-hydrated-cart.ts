import { useCart } from '../../../context/CartContext';
import { storeApi } from '../api';
import { cartTotals, hydrateCart } from '../model';
import { useStoreRead } from '../use-store-read';
export function useHydratedCart() {
    const cart = useCart();
    const key = JSON.stringify(cart.lines);
    const result = useStoreRead(key, (signal) =>
        storeApi.resolve(
            cart.lines.map((line) => line.productId),
            signal,
        ),
    );
    const items = hydrateCart(cart.lines, result.data?.items ?? []);
    return { ...cart, ...result, items, totals: cartTotals(items) };
}
