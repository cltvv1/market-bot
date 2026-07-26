import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const action = process.argv[2];
const supportedActions = new Set(['create', 'reset', 'drop']);

if (!supportedActions.has(action)) {
  throw new Error('Usage: node scripts/test-database.mjs <create|reset|drop>');
}

function required(name, fallbackName) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : '');
  if (!value) {
    throw new Error(`Missing required database environment variable ${name}${fallbackName ? ` or ${fallbackName}` : ''}`);
  }
  return value;
}

const database = required('TEST_DB_NAME');
const applicationDatabase = process.env.DB_NAME?.trim();

if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error('TEST_DB_NAME may contain only ASCII letters, digits, and underscores');
}
if (!database.endsWith('_test')) {
  throw new Error('TEST_DB_NAME must end with _test');
}
if (applicationDatabase && database === applicationDatabase) {
  throw new Error('TEST_DB_NAME must differ from DB_NAME');
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const client = new Client({
  host: required('TEST_DB_HOST', 'DB_HOST'),
  port: Number(required('TEST_DB_PORT', 'DB_PORT')),
  database: process.env.TEST_DB_ADMIN_NAME?.trim() || 'postgres',
  user: required('TEST_DB_USER', 'DB_USER'),
  password: required('TEST_DB_PASS', 'DB_PASS'),
});

await client.connect();

try {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  const databaseExists = exists.rowCount === 1;

  if (action === 'create' && databaseExists) {
    process.stdout.write(`Test database ${database} already exists.\n`);
    process.exitCode = 0;
  } else {
    if ((action === 'reset' || action === 'drop') && databaseExists) {
      await client.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [database],
      );
      await client.query(`DROP DATABASE ${quoteIdentifier(database)}`);
      process.stdout.write(`Dropped test database ${database}.\n`);
    }

    if (action === 'create' || action === 'reset') {
      await client.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
      process.stdout.write(`Created test database ${database}.\n`);
    }
  }
} finally {
  await client.end();
}
