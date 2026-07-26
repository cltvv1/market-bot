import type { ConfigService } from '@nestjs/config';

const DEVELOPMENT_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
];

export function parseCsv(value?: string | null) {
    return (value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function getAllowedBrowserOrigins(config: ConfigService) {
    const configured = parseCsv(config.get<string>('CORS_ORIGINS'));
    if (config.get<string>('NODE_ENV') === 'production') {
        return configured;
    }

    return [...new Set([...configured, ...DEVELOPMENT_ORIGINS])];
}

export function shouldEnableSwagger(
    nodeEnv?: string,
    explicit?: boolean,
) {
    return explicit ?? nodeEnv !== 'production';
}

export function getRequestOrigin(
    protocol: string,
    host?: string,
) {
    return host ? `${protocol}://${host}` : null;
}
