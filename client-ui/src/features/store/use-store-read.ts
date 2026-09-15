import { useCallback, useEffect, useRef, useState } from 'react';

// A changed route cannot render the previous route's response, even before effect cleanup.
export function useStoreRead<T>(
    key: string | null,
    read: (signal: AbortSignal) => Promise<T>,
) {
    const reader = useRef(read);
    reader.current = read;
    const sequence = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const keyRef = useRef(key);
    keyRef.current = key;
    const [state, setState] = useState<{
        key: string | null;
        data: T | null;
        error: unknown;
        loading: boolean;
    }>({ key, data: null, error: null, loading: key !== null });
    const refresh = useCallback(async () => {
        const currentKey = keyRef.current;
        if (currentKey === null) return null;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const request = ++sequence.current;
        setState((previous) => ({
            key: currentKey,
            data: previous.key === currentKey ? previous.data : null,
            error: null,
            loading: true,
        }));
        try {
            const result = await reader.current(abort.signal);
            if (
                abort.signal.aborted ||
                sequence.current !== request ||
                keyRef.current !== currentKey
            )
                return null;
            setState({
                key: currentKey,
                data: result,
                error: null,
                loading: false,
            });
            return result;
        } catch (error) {
            if (
                !abort.signal.aborted &&
                sequence.current === request &&
                keyRef.current === currentKey
            )
                setState({
                    key: currentKey,
                    data: null,
                    error,
                    loading: false,
                });
            return null;
        }
    }, []);
    useEffect(() => {
        void refresh();
        return () => {
            controller.current?.abort();
            sequence.current++;
        };
    }, [key, refresh]);
    return {
        ...(state.key === key
            ? state
            : { key, data: null, error: null, loading: key !== null }),
        refresh,
    };
}
