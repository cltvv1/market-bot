import { ConfigService } from '@nestjs/config';
import {
    getAllowedBrowserOrigins,
    shouldEnableSwagger,
} from './security.config';

describe('browser origin configuration', () => {
    it('does not create an open production CORS allowlist', () => {
        const config = new ConfigService({
            NODE_ENV: 'production',
            CORS_ORIGINS: '',
        });
        expect(getAllowedBrowserOrigins(config)).toEqual([]);
    });

    it('adds explicit production origins only', () => {
        const config = new ConfigService({
            NODE_ENV: 'production',
            CORS_ORIGINS: 'https://vitma.example,https://admin.vitma.example',
        });
        expect(getAllowedBrowserOrigins(config)).toEqual([
            'https://vitma.example',
            'https://admin.vitma.example',
        ]);
    });

    it('keeps Swagger off by default in production', () => {
        expect(shouldEnableSwagger('production', undefined)).toBe(false);
        expect(shouldEnableSwagger('production', true)).toBe(true);
        expect(shouldEnableSwagger('development', undefined)).toBe(true);
    });
});
