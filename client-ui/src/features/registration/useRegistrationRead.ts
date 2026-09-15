import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientApiError, SESSION_LOST } from '../../api/client-session';

export function useRegistrationRead<T>(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
    poll?: (data: T) => boolean,
) {
    const load = useRef(loader);
    load.current = loader;
    const shouldPoll = useRef(poll);
    shouldPoll.current = poll;
    const [state, setState] = useState<{
        key: string;
        data?: T;
        error?: unknown;
        loading: boolean;
    }>({ key, loading: true });
    const active = useRef<{
        key: string;
        controller: AbortController;
        promise: Promise<T | undefined>;
    } | null>(null);
    const currentKey = useRef(key);
    currentKey.current = key;
    const mounted = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const errors = useRef(0);
    const polling = useRef(false);
    const refresh = useCallback((): Promise<T | undefined> => {
        if (!mounted.current || currentKey.current !== key)
            return Promise.resolve(undefined);
        if (active.current?.key === key) return active.current.promise;
        clearTimeout(timer.current);
        const controller = new AbortController();
        const operation: {
            key: string;
            controller: AbortController;
            promise: Promise<T | undefined>;
        } = { key, controller, promise: Promise.resolve(undefined) };
        active.current = operation;
        setState((old) => ({ ...old, key, loading: true, error: undefined }));
        operation.promise = (async () => {
            let again = false;
            try {
                const data = await load.current(
                    AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(30_000),
                    ]),
                );
                if (controller.signal.aborted || currentKey.current !== key)
                    return undefined;
                errors.current = 0;
                setState({ key, data, loading: false });
                again = !!shouldPoll.current?.(data);
                return data;
            } catch (error) {
                if (controller.signal.aborted || currentKey.current !== key)
                    return undefined;
                const denied =
                    error instanceof ClientApiError &&
                    [400, 401, 403, 404].includes(error.status);
                errors.current += 1;
                again = !!shouldPoll.current && !denied;
                setState((old) => ({
                    key,
                    data: denied
                        ? undefined
                        : old.key === key
                          ? old.data
                          : undefined,
                    error,
                    loading: false,
                }));
            } finally {
                if (active.current === operation) {
                    active.current = null;
                    polling.current = again;
                    if (again && mounted.current)
                        timer.current = setTimeout(
                            () => {
                                if (document.visibilityState === 'visible')
                                    void refresh();
                            },
                            Math.min(30_000 * 2 ** errors.current, 240_000),
                        );
                }
            }
        })();
        return operation.promise;
    }, [key]);
    useEffect(() => {
        mounted.current = true;
        errors.current = 0;
        polling.current = false;
        void refresh();
        const visible = () => {
            if (document.visibilityState === 'visible' && polling.current)
                void refresh();
        };
        const lost = () => {
            active.current?.controller.abort();
            clearTimeout(timer.current);
            polling.current = false;
            setState({
                key,
                loading: false,
                error: new ClientApiError(401, 'SESSION_LOST'),
            });
        };
        document.addEventListener('visibilitychange', visible);
        window.addEventListener(SESSION_LOST, lost);
        return () => {
            mounted.current = false;
            active.current?.controller.abort();
            active.current = null;
            polling.current = false;
            clearTimeout(timer.current);
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener(SESSION_LOST, lost);
        };
    }, [key, refresh]);
    return {
        data: state.key === key ? state.data : undefined,
        error: state.key === key ? state.error : undefined,
        loading: state.key !== key || state.loading,
        refresh,
    };
}
