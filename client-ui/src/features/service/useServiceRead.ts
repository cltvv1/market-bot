import { useCallback, useEffect, useRef, useState } from 'react';
import { ServiceApiError } from './api';

export function useServiceRead<T>(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
) {
    const load = useRef(loader);
    load.current = loader;
    const active = useRef<{ controller: AbortController; key: string } | null>(
        null,
    );
    const currentKey = useRef(key);
    const mounted = useRef(false);
    currentKey.current = key;
    const [state, setState] = useState<{
        key: string;
        data?: T;
        error?: unknown;
        loading: boolean;
    }>({ key, loading: true });
    const refresh = useCallback(async () => {
        if (!mounted.current || currentKey.current !== key) return undefined;
        active.current?.controller.abort();
        const controller = new AbortController();
        const operation = { controller, key };
        active.current = operation;
        setState((old) => ({ ...old, loading: true, error: undefined }));
        try {
            const data = await load.current(controller.signal);
            if (controller.signal.aborted || currentKey.current !== key)
                return undefined;
            setState({ key, data, loading: false });
            return data;
        } catch (error) {
            if (controller.signal.aborted || currentKey.current !== key)
                return undefined;
            setState((old) => ({
                key,
                data:
                    error instanceof ServiceApiError &&
                    [401, 403, 404].includes(error.status)
                        ? undefined
                        : old.key === key
                          ? old.data
                          : undefined,
                error,
                loading: false,
            }));
            return undefined;
        }
    }, [key]);
    useEffect(() => {
        mounted.current = true;
        void refresh();
        return () => {
            mounted.current = false;
            active.current?.controller.abort();
        };
    }, [refresh]);
    return {
        data: state.key === key ? state.data : undefined,
        error: state.key === key ? state.error : undefined,
        loading: state.key !== key || state.loading,
        refresh,
    };
}

export function useMounted() {
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    return mounted;
}
