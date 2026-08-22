import 'dotenv/config';
import * as os from 'node:os';
import * as path from 'node:path';

const testDatabase = process.env.TEST_DB_NAME?.trim();
if (!testDatabase) {
    throw new Error('TEST_DB_NAME is required for e2e tests');
}

process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = '000000000:test-only-token';
process.env.BOT_POLLING_ENABLED = 'false';
process.env.MAX_BOT_TOKEN = '';
process.env.SWAGGER_ENABLED = 'true';
process.env.SERVE_BUILT_UI = 'true';
process.env.FILE_STORAGE_ROOT = path.join(
    os.tmpdir(),
    `vitma-e2e-storage-${process.pid}`,
);
