import 'dotenv/config';

const testDatabase = process.env.TEST_DB_NAME?.trim();
if (!testDatabase) {
    throw new Error('TEST_DB_NAME is required for integration tests');
}

process.env.NODE_ENV = 'test';
process.env.BOT_POLLING_ENABLED = 'false';
process.env.MAX_BOT_TOKEN = ' ';
process.env.SWAGGER_ENABLED = 'false';
process.env.TRUST_PROXY = '1';
