const SENSITIVE_KEY = /(pass(word)?|secret|token|cookie|csrf|otp|authorization|content|buffer|raw)/i;

export function sanitizeAuditMetadata(
    value: unknown,
    depth = 0,
): unknown {
    if (depth > 5) return '[truncated]';
    if (value === null || value === undefined) return value;
    if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
    if (typeof value === 'string') return value.slice(0, 500);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 100)
                .map(([key, item]) => [
                    key,
                    SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeAuditMetadata(item, depth + 1),
                ]),
        );
    }
    return `[${typeof value}]`;
}
