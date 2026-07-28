import 'dotenv/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const testDatabase = process.env.TEST_DB_NAME?.trim();
if (!testDatabase) {
    throw new Error('TEST_DB_NAME is required for integration tests');
}

process.env.NODE_ENV = 'test';
process.env.BOT_POLLING_ENABLED = 'false';
process.env.MAX_BOT_TOKEN = ' ';
process.env.SWAGGER_ENABLED = 'false';
process.env.TRUST_PROXY = '1';
process.env.FILE_STORAGE_ROOT = process.env.FILE_STORAGE_ROOT?.trim()
    ? path.resolve(process.env.FILE_STORAGE_ROOT)
    : path.join(os.tmpdir(), `vitma-integration-storage-${process.pid}`);
fs.rmSync(process.env.FILE_STORAGE_ROOT, { recursive: true, force: true });
