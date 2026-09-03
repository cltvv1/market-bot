import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export function useRead<T>(path: string | null, refreshKey = 0) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{
        path: string | null;
        data?: T;
        error?: unknown;
        loading: boolean;
    }>({ path, loading: Boolean(path) });
    useEffect(() => {
        const controller = new AbortController();
        if (!path) {
            setResult({ path, loading: false });
            return;
        }
        setResult({ path, loading: true });
        void api<T>(path, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted)
                    setResult({ path, data, loading: false });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    setResult({ path, error, loading: false });
            });
        return () => controller.abort();
    }, [path, revision, refreshKey]);
    const retry = useCallback(() => setRevision((value) => value + 1), []);
    // Do not flash a previous client's detail when the route changes.
    return {
        ...(result.path === path
            ? result
            : { path, data: undefined, error: undefined, loading: true }),
        retry,
    };
}
