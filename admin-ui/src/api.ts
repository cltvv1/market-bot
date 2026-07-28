export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = 'REQUEST_FAILED',
    public errors: Array<{ field?: string; code: string; message: string }> = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: options.body instanceof FormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const payload = await readError(response);
    if (response.status === 401) window.dispatchEvent(new Event('vitma:unauthorized'));
    if (response.status === 403) {
      window.dispatchEvent(new CustomEvent('vitma:forbidden', {
        detail: payload.message || 'Недостаточно прав для этого действия',
      }));
    }
    throw new ApiError(payload.message, response.status, payload.code, payload.errors);
  }
  return response.json() as Promise<T>;
}

async function readError(response: Response) {
  const fallback = { message: response.statusText || 'Ошибка запроса', code: 'REQUEST_FAILED', errors: [] };
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    return { ...fallback, message: (await response.text()) || fallback.message };
  }
  const payload = await response.json() as Partial<typeof fallback>;
  return {
    message: payload.message || fallback.message,
    code: payload.code || fallback.code,
    errors: Array.isArray(payload.errors) ? payload.errors : [],
  };
}

export function post<T>(path: string, body: unknown = {}): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function upload<T>(path: string, form: FormData): Promise<T> {
  return api<T>(path, { method: 'POST', body: form });
}
