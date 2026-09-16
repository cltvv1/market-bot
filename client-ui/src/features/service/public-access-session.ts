export const PUBLIC_ACCESS_KEY = 'vitma-service-public-access-v1';
let memory: string | null = null;
let invalid = false;
export function validAccessToken(value: string) {
    return /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}
export function clearPublicAccess(token?: string) {
    if (token && token !== readPublicAccess()) return;
    memory = null;
    invalid = true;
    try {
        sessionStorage.removeItem(PUBLIC_ACCESS_KEY);
    } catch {
        /* Memory-only fallback. */
    }
}
export function readPublicAccess() {
    if (memory) return memory;
    try {
        const saved = sessionStorage.getItem(PUBLIC_ACCESS_KEY);
        if (saved && validAccessToken(saved)) return saved;
        if (saved) clearPublicAccess();
    } catch {
        /* Storage can be unavailable in restricted browser contexts. */
    }
    return null;
}
export function invalidPublicAccess() {
    return invalid;
}

// Run before rendering the router so the initial history entry never retains the secret.
export function bootstrapPublicAccess() {
    if (!/\/service\/status\/?$/.test(window.location.pathname)) return;
    const url = new URL(window.location.href);
    const legacy = ['token', 'accessToken'].some((key) =>
        url.searchParams.has(key),
    );
    if (!url.hash && !legacy) return;
    const match = /^#access=([A-Za-z0-9_-]{43})$/.exec(url.hash);
    url.hash = '';
    url.searchParams.delete('token');
    url.searchParams.delete('accessToken');
    window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search,
    );
    clearPublicAccess();
    if (!legacy && match && validAccessToken(match[1])) {
        memory = match[1];
        invalid = false;
        try {
            sessionStorage.setItem(PUBLIC_ACCESS_KEY, memory);
        } catch {
            /* Memory-only access. */
        }
    }
}

export function publicShareLink(token: string) {
    if (!validAccessToken(token))
        throw new Error('Invalid public access response');
    const url = new URL('/site/service/status', window.location.origin);
    url.hash = `access=${token}`;
    return url.href;
}
