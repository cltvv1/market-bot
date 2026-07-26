import { useEffect, useState } from 'react';
import { ensureWebSession } from '../services/client';

export function WebSessionBoundary({
    children,
}: {
    children: React.ReactNode;
}) {
    const [state, setState] = useState<'loading' | 'ready' | 'error'>(
        'loading',
    );

    const connect = () => {
        setState('loading');
        ensureWebSession()
            .then(() => setState('ready'))
            .catch(() => setState('error'));
    };

    useEffect(connect, []);

    if (state === 'loading') {
        return (
            <main className="session-state" aria-live="polite">
                Подключаем защищённую сессию...
            </main>
        );
    }
    if (state === 'error') {
        return (
            <main className="session-state" role="alert">
                <strong>Не удалось подключиться к серверу</strong>
                <button type="button" onClick={connect}>
                    Повторить
                </button>
            </main>
        );
    }
    return children;
}
