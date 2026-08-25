import path from 'node:path';

const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`CI safety check requires ${name}`);
    return value;
};

if (process.env.NODE_ENV !== 'test') {
    throw new Error('CI checks require NODE_ENV=test');
}
if (process.env.BOT_POLLING_ENABLED !== 'false') {
    throw new Error('CI checks require BOT_POLLING_ENABLED=false');
}
if (process.env.OUTBOUND_DELIVERY_WORKER_ENABLED !== 'false') {
    throw new Error('CI checks require OUTBOUND_DELIVERY_WORKER_ENABLED=false');
}
if (process.env.MAX_BOT_TOKEN?.trim()) {
    throw new Error('CI checks require an empty MAX_BOT_TOKEN');
}
if (!required('BOT_TOKEN').startsWith('ci-')) {
    throw new Error(
        'CI checks require a clearly fake BOT_TOKEN starting with ci-',
    );
}

const testDatabase = required('TEST_DB_NAME');
if (!testDatabase.endsWith('_test')) {
    throw new Error('TEST_DB_NAME must end with _test');
}
if (testDatabase === process.env.DB_NAME?.trim()) {
    throw new Error('TEST_DB_NAME must differ from DB_NAME');
}

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const testHost = (process.env.TEST_DB_HOST || process.env.DB_HOST || '').trim();
if (!allowedHosts.has(testHost)) {
    throw new Error(`Unsafe test database host: ${testHost || '<empty>'}`);
}

const storageRoot = path.resolve(required('FILE_STORAGE_ROOT'));
const repositoryStorage = path.resolve('storage');
if (
    storageRoot === repositoryStorage ||
    storageRoot.startsWith(`${repositoryStorage}${path.sep}`)
) {
    throw new Error(
        'CI FILE_STORAGE_ROOT must be outside the repository storage directory',
    );
}

process.stdout.write(
    `CI environment is isolated: database=${testDatabase}, host=${testHost}, storage=${storageRoot}\n`,
);
