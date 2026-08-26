import { validationSchema } from './app.config';

describe('application security configuration', () => {
    const base = {
        BOT_TOKEN: 'test-token',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'vitma_test',
        DB_USER: 'vitma_app',
        DB_PASS: 'test-password',
    };

    it('defaults to direct access without trusted proxies', () => {
        const result = validationSchema.validate(base);
        const value = result.value as unknown as { TRUST_PROXY: number };
        expect(result.error).toBeUndefined();
        expect(value.TRUST_PROXY).toBe(0);
    });

    it('accepts a bounded explicit proxy hop count', () => {
        const accepted = validationSchema.validate({
            ...base,
            TRUST_PROXY: '1',
        }).value as unknown as { TRUST_PROXY: number };
        expect(accepted.TRUST_PROXY).toBe(1);
        expect(
            validationSchema.validate({ ...base, TRUST_PROXY: 'all' }).error,
        ).toBeDefined();
        expect(
            validationSchema.validate({ ...base, TRUST_PROXY: '4' }).error,
        ).toBeDefined();
    });

    it('defaults and bounds hosted support file size', () => {
        const value = validationSchema.validate(base).value as unknown as {
            SUPPORT_FILE_MAX_BYTES: number;
        };
        expect(value.SUPPORT_FILE_MAX_BYTES).toBe(536_870_912);
        expect(
            validationSchema.validate({
                ...base,
                SUPPORT_FILE_MAX_BYTES: 1_073_741_824,
            }).error,
        ).toBeUndefined();
        expect(
            validationSchema.validate({
                ...base,
                SUPPORT_FILE_MAX_BYTES: 1_073_741_825,
            }).error,
        ).toBeDefined();
    });
});
