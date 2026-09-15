import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api';
import { catalogError } from './api';

export function useCatalogMutation<
    T extends { expectedUpdatedAt: string; expectedCategoryUpdatedAt?: string },
>(initial: T | null, read: (current: T | null) => Promise<T | null>) {
    const [snapshot, setSnapshot] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [reconciled, setReconciled] = useState(false);
    const [terminal, setTerminal] = useState(false);
    const submitting = useRef(false);
    const previousIncoming = useRef(initial);
    // Background reads must never replace the user's local fields or grant a new write token silently.
    useEffect(() => {
        if (previousIncoming.current === initial) return;
        previousIncoming.current = initial;
        if (
            initial &&
            (initial.expectedUpdatedAt !== snapshot?.expectedUpdatedAt ||
                initial.expectedCategoryUpdatedAt !==
                    snapshot?.expectedCategoryUpdatedAt)
        ) {
            setSnapshot(initial);
            setUncertain(true);
            setReconciled(true);
            setError('На сервере есть изменения. Сверьте их со своими полями.');
        }
    }, [
        initial,
        snapshot?.expectedUpdatedAt,
        snapshot?.expectedCategoryUpdatedAt,
    ]);
    async function reread() {
        setReconciled(false);
        try {
            setSnapshot(await read(snapshot));
            setReconciled(true);
        } catch (failure) {
            setError(catalogError(failure));
            if (
                failure instanceof ApiError &&
                [401, 403, 404].includes(failure.status)
            )
                setTerminal(true);
        }
    }
    async function perform(
        command: () => Promise<T>,
        saved: (result: T) => void,
    ) {
        if (submitting.current || uncertain || terminal) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await command();
            setSnapshot(result);
            saved(result);
        } catch (failure) {
            setError(catalogError(failure));
            if (
                failure instanceof ApiError &&
                [401, 403, 404].includes(failure.status)
            )
                setTerminal(true);
            else if (
                !(failure instanceof ApiError) ||
                failure.status >= 500 ||
                failure.status === 409
            ) {
                setUncertain(true);
                await reread();
            }
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    return {
        snapshot,
        busy,
        error,
        uncertain,
        reconciled,
        terminal,
        perform,
        reread,
        acknowledge: () => {
            if (reconciled && !terminal) {
                setUncertain(false);
                setError('');
            }
        },
        setError,
    };
}
