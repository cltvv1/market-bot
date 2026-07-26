import {
    readApplicationDatabaseConfig,
    readTestDatabaseConfig,
} from './database-options';

describe('database environment characterization', () => {
    it('requires all application database variables', () => {
        expect(() => readApplicationDatabaseConfig({})).toThrow(
            'Missing required database environment variable DB_HOST',
        );
    });

    it('allows test server credentials to inherit from DB variables', () => {
        expect(
            readTestDatabaseConfig({
                DB_HOST: 'localhost',
                DB_PORT: '5432',
                DB_NAME: 'vitma_dev',
                DB_USER: 'vitma',
                DB_PASS: 'secret',
                TEST_DB_NAME: 'vitma_test',
            }),
        ).toEqual({
            host: 'localhost',
            port: 5432,
            database: 'vitma_test',
            username: 'vitma',
            password: 'secret',
        });
    });

    it('rejects a test database that is also the application database', () => {
        expect(() =>
            readTestDatabaseConfig({
                DB_HOST: 'localhost',
                DB_PORT: '5432',
                DB_NAME: 'vitma_test',
                DB_USER: 'vitma',
                DB_PASS: 'secret',
                TEST_DB_NAME: 'vitma_test',
            }),
        ).toThrow('TEST_DB_NAME must differ from DB_NAME');
    });
});
