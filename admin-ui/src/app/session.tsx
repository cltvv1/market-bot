import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
    type FormEvent,
} from 'react';
import { ApiError, api, post } from '../api';
import type { Admin } from '../types';
import { ReadState } from './primitives';

const SessionContext = createContext<{
    admin: Admin;
    revision: number;
    refresh: () => void;
    logout: () => Promise<void>;
    notify: (text: string) => void;
} | null>(null);
export function useSession() {
    const value = useContext(SessionContext);
    if (!value) throw new Error('Admin session is required');
    return value;
}
export function SessionProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<Admin | null>(null);
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState<unknown>();
    const [notice, notify] = useState('');
    const [revision, setRevision] = useState(0);
    const checkingPermissions = useRef(false);
    const generation = useRef(0);
    async function check() {
        const current = ++generation.current;
        setError(undefined);
        try {
            const result = await api<{ admin: Admin }>('/admin/api/me');
            if (current === generation.current)
                setAdmin((previous) =>
                    JSON.stringify(previous) === JSON.stringify(result.admin)
                        ? previous
                        : result.admin,
                );
        } catch (reason) {
            if (current === generation.current) {
                setAdmin(null);
                if (!(reason instanceof ApiError && reason.status === 401))
                    setError(reason);
            }
        } finally {
            if (current === generation.current) setChecking(false);
        }
    }
    useEffect(() => {
        void check();
    }, []);
    useEffect(() => {
        const expire = () => {
            generation.current++;
            setAdmin(null);
            setChecking(false);
            notify('Сессия завершена. Войдите снова.');
        };
        const forbidden = () => {
            notify('Недостаточно прав для этого действия.');
            if (checkingPermissions.current) return;
            checkingPermissions.current = true;
            // Failed reads clear their data. Keeping the route mounted avoids a 403 retry loop.
            void check().finally(() => {
                checkingPermissions.current = false;
            });
        };
        const receive = (event: Event) => {
            if (
                event instanceof CustomEvent &&
                typeof event.detail === 'string'
            )
                notify(event.detail);
        };
        window.addEventListener('vitma:unauthorized', expire);
        window.addEventListener('vitma:forbidden', forbidden);
        window.addEventListener('vitma:notice', receive);
        return () => {
            window.removeEventListener('vitma:unauthorized', expire);
            window.removeEventListener('vitma:forbidden', forbidden);
            window.removeEventListener('vitma:notice', receive);
        };
    }, []);
    if (checking) return <ReadState loading retry={() => void check()} />;
    if (error) return <ReadState error={error} retry={() => void check()} />;
    if (!admin)
        return (
            <Login
                notice={notice}
                onLogin={(value) => {
                    setAdmin(value);
                    notify('');
                }}
            />
        );
    return (
        <SessionContext.Provider
            value={{
                admin,
                revision,
                refresh: () => setRevision((value) => value + 1),
                notify,
                logout: async () => {
                    await post('/admin/api/logout');
                    setAdmin(null);
                },
            }}
        >
            {notice && (
                <div className="admin-global-notice admin-notice" role="status">
                    {notice}
                    <button
                        aria-label="Закрыть сообщение"
                        onClick={() => notify('')}
                    >
                        Закрыть
                    </button>
                </div>
            )}
            {children}
        </SessionContext.Provider>
    );
}
function Login({
    notice,
    onLogin,
}: {
    notice: string;
    onLogin: (admin: Admin) => void;
}) {
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            onLogin(
                (
                    await post<{ admin: Admin }>('/admin/api/login', {
                        login,
                        password,
                    })
                ).admin,
            );
        } catch (reason) {
            setError(
                reason instanceof ApiError && reason.status === 401
                    ? 'Неверный логин или пароль'
                    : 'Не удалось войти. Повторите попытку.',
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="admin-login">
            <form
                className="admin-form"
                onSubmit={(event) => void submit(event)}
            >
                <span className="admin-brand">VITMA MARKET</span>
                <h1>Вход для сотрудников</h1>
                {notice && <p role="status">{notice}</p>}
                <label>
                    Логин
                    <input
                        name="username"
                        autoComplete="username"
                        required
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        autoFocus
                    />
                </label>
                <label>
                    Пароль
                    <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>
                {error && <p role="alert">{error}</p>}
                <button
                    className="admin-button admin-button--primary"
                    disabled={busy}
                >
                    {busy ? 'Входим…' : 'Войти'}
                </button>
            </form>
        </div>
    );
}
