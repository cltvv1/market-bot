import 'dotenv/config';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';

const action = process.argv[2];
const option = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
};
const has = (name) => process.argv.includes(name);
const container = option('--container') || 'vitma_postgres';
const tarCommand = process.platform === 'win32' ? 'tar.exe' : 'tar';
const backupRoot = path.resolve(process.env.BACKUP_DIR || 'backups');
const storageRoot = path.resolve(process.env.FILE_STORAGE_ROOT || 'storage');
const db = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
};

if (!['create', 'verify', 'restore', 'drill'].includes(action)) {
    fail('Usage: node scripts/backup.mjs <create|verify|restore|drill>');
}

if (action === 'create') await createBackup();
if (action === 'verify') await verifyBackup(required('--backup'));
if (action === 'restore')
    await restoreBackup(
        required('--backup'),
        required('--target-db'),
        required('--target-storage'),
    );
if (action === 'drill') await drill();

async function createBackup() {
    if (!has('--offline-confirm') && process.env.BACKUP_OFFLINE !== 'true') {
        fail(
            'Offline maintenance confirmation is required: use --offline-confirm after stopping the application',
        );
    }
    if (await portOpen(3000))
        fail(
            'Port 3000 is listening. Stop the application before creating a coordinated backup',
        );
    fs.mkdirSync(backupRoot, { recursive: true });
    const id = `vitma-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const setDir = path.join(backupRoot, id);
    fs.mkdirSync(setDir);
    const dumpPath = path.join(setDir, 'database.dump');
    const containerDump = `/tmp/${id}.dump`;
    run('docker', [
        'exec',
        container,
        'pg_dump',
        '-U',
        db.user,
        '-d',
        db.database,
        '-Fc',
        '-f',
        containerDump,
    ]);
    run('docker', ['cp', `${container}:${containerDump}`, dumpPath]);
    run('docker', ['exec', container, 'rm', '-f', containerDump]);

    const storageArchive = path.join(setDir, 'storage.tar.gz');
    fs.mkdirSync(storageRoot, { recursive: true });
    run(tarCommand, ['-czf', storageArchive, '-C', storageRoot, '.']);
    const databaseMetadata = await inspectDatabase(db.database);
    const storageFiles = await listPhysicalFiles(storageRoot);
    const manifest = {
        formatVersion: 1,
        application: 'vitma-market',
        createdAt: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        consistencyModel: 'offline-single-instance',
        database: {
            name: db.database,
            dump: 'database.dump',
            sha256: await checksum(dumpPath),
            ...databaseMetadata,
        },
        storage: {
            provider: 'local',
            archive: 'storage.tar.gz',
            archiveSha256: await checksum(storageArchive),
            fileCount: storageFiles.length,
            totalBytes: storageFiles.reduce(
                (sum, file) => sum + file.sizeBytes,
                0,
            ),
            files: storageFiles,
        },
        preflight: { applicationPortClosed: true, offlineConfirmed: true },
    };
    fs.writeFileSync(
        path.join(setDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await recordSystemAudit('backup.create', 'backup_set', id, {
        consistencyModel: 'offline-single-instance',
    });
    process.stdout.write(`${setDir}\n`);
}

async function verifyBackup(setDirInput) {
    const setDir = path.resolve(setDirInput);
    const manifestPath = path.join(setDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) fail('Backup manifest is missing');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.formatVersion !== 1 || manifest.application !== 'vitma-market')
        fail('Unsupported backup manifest');
    for (const value of [manifest.database.dump, manifest.storage.archive]) {
        if (!value || path.isAbsolute(value) || value.includes('..'))
            fail('Manifest contains an unsafe path');
    }
    await assertChecksum(
        path.join(setDir, manifest.database.dump),
        manifest.database.sha256,
    );
    await assertChecksum(
        path.join(setDir, manifest.storage.archive),
        manifest.storage.archiveSha256,
    );
    const knownMigrations = new Set(
        fs
            .readdirSync(path.join('src', 'database', 'migrations'))
            .map(
                (name) =>
                    fs
                        .readFileSync(
                            path.join('src', 'database', 'migrations', name),
                            'utf8',
                        )
                        .match(/export class\s+([A-Za-z0-9_]+)/)?.[1],
            )
            .filter(Boolean),
    );
    for (const migration of manifest.database.migrations) {
        if (!knownMigrations.has(migration.name))
            fail(`Unknown migration in backup: ${migration.name}`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vitma-verify-'));
    try {
        run(tarCommand, [
            '-xzf',
            path.join(setDir, manifest.storage.archive),
            '-C',
            temporary,
        ]);
        const actual = await listPhysicalFiles(temporary);
        const actualMap = new Map(actual.map((file) => [file.objectKey, file]));
        for (const expected of manifest.storage.files) {
            const item = actualMap.get(expected.objectKey);
            if (!item)
                fail(
                    `Storage file is missing from archive: ${expected.objectKey}`,
                );
            if (
                item.sha256 !== expected.sha256 ||
                item.sizeBytes !== expected.sizeBytes
            )
                fail(`Storage checksum mismatch: ${expected.objectKey}`);
            actualMap.delete(expected.objectKey);
        }
        if (actualMap.size)
            fail(
                `Storage archive has unexpected files: ${[...actualMap.keys()].join(', ')}`,
            );
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
    process.stdout.write(`Backup verified: ${setDir}\n`);
    return manifest;
}

async function restoreBackup(setDirInput, targetDatabase, targetStorageInput) {
    if (
        !/^[A-Za-z0-9_]+$/.test(targetDatabase) ||
        targetDatabase === db.database
    )
        fail('Restore requires a separate safe target database name');
    const targetStorage = path.resolve(targetStorageInput);
    if (targetStorage === storageRoot)
        fail('Restore requires a separate target storage directory');
    const manifest = await verifyBackup(setDirInput);
    const existing = await databaseExists(targetDatabase);
    if (existing && !has('--force'))
        fail(
            'Target database already exists; restore requires an absent database',
        );
    if (
        fs.existsSync(targetStorage) &&
        fs.readdirSync(targetStorage).length &&
        !has('--force')
    )
        fail('Target storage directory is not empty');
    if (!existing)
        run('docker', [
            'exec',
            container,
            'createdb',
            '-U',
            db.user,
            targetDatabase,
        ]);
    fs.mkdirSync(targetStorage, { recursive: true });
    const containerDump = `/tmp/vitma-restore-${Date.now()}.dump`;
    const dumpPath = path.join(
        path.resolve(setDirInput),
        manifest.database.dump,
    );
    run('docker', ['cp', dumpPath, `${container}:${containerDump}`]);
    run('docker', [
        'exec',
        container,
        'pg_restore',
        '-U',
        db.user,
        '-d',
        targetDatabase,
        '--no-owner',
        containerDump,
    ]);
    run('docker', ['exec', container, 'rm', '-f', containerDump]);
    run(tarCommand, [
        '-xzf',
        path.join(path.resolve(setDirInput), manifest.storage.archive),
        '-C',
        targetStorage,
    ]);
    const restored = await inspectDatabase(targetDatabase);
    for (const [table, count] of Object.entries(manifest.database.rowCounts)) {
        if (restored.rowCounts[table] !== count)
            fail(`Restored row count mismatch for ${table}`);
    }
    const restoredFiles = await listPhysicalFiles(targetStorage);
    if (restoredFiles.length !== manifest.storage.fileCount)
        fail('Restored storage file count mismatch');
    await recordSystemAudit('backup.restore', 'database', targetDatabase, {
        backupSet: path.basename(path.resolve(setDirInput)),
        storageFileCount: restoredFiles.length,
    });
    process.stdout.write(
        `Restore completed: database=${targetDatabase} storage=${targetStorage}\n`,
    );
}

async function drill() {
    await createBackup();
    const sets = fs
        .readdirSync(backupRoot)
        .map((name) => path.join(backupRoot, name))
        .filter((item) => fs.statSync(item).isDirectory())
        .sort();
    const setDir = sets.at(-1);
    const targetDatabase = `vitma_restore_drill_${Date.now()}`;
    const targetStorage = path.join(os.tmpdir(), targetDatabase);
    try {
        process.argv.push(
            '--backup',
            setDir,
            '--target-db',
            targetDatabase,
            '--target-storage',
            targetStorage,
        );
        await restoreBackup(setDir, targetDatabase, targetStorage);
        const restored = await inspectDatabase(targetDatabase);
        if (
            !('stored_files' in restored.rowCounts) ||
            !('audit_events' in restored.rowCounts)
        )
            fail('Drill domain integrity check failed');
        const integrity = await inspectDomainIntegrity(targetDatabase);
        if (
            !integrity.registrations ||
            !integrity.registrationFiles ||
            !integrity.serviceRequests ||
            !integrity.ticketFiles ||
            !integrity.admins ||
            !integrity.roles
        ) {
            fail(
                `Drill domain integrity check failed: ${JSON.stringify(integrity)}`,
            );
        }
        process.stdout.write(`Restore drill passed: ${targetDatabase}\n`);
    } finally {
        if (await databaseExists(targetDatabase))
            run('docker', [
                'exec',
                container,
                'dropdb',
                '-U',
                db.user,
                '--force',
                targetDatabase,
            ]);
        fs.rmSync(targetStorage, { recursive: true, force: true });
    }
}

async function inspectDatabase(database) {
    const client = new pg.Client({ ...db, database });
    await client.connect();
    try {
        const migrations = (
            await client.query(
                'SELECT name, timestamp FROM typeorm_migrations ORDER BY id',
            )
        ).rows;
        const tables = (
            await client.query(
                `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
            )
        ).rows.map((row) => row.tablename);
        const rowCounts = {};
        for (const table of tables)
            rowCounts[table] = Number(
                (
                    await client.query(
                        `SELECT count(*)::int AS count FROM "${table.replaceAll('"', '""')}"`,
                    )
                ).rows[0].count,
            );
        return {
            migrations,
            tableCount: tables.length,
            rowCounts,
            storedFileCount: rowCounts.stored_files || 0,
        };
    } finally {
        await client.end();
    }
}
async function recordSystemAudit(action, targetType, targetId, metadata) {
    const client = new pg.Client(db);
    await client.connect();
    try {
        await client.query(
            `INSERT INTO audit_events ("actorType", action, "targetType", "targetId", result, metadata)
       VALUES ('system', $1, $2, $3, 'success', $4)`,
            [action, targetType, targetId, metadata],
        );
    } finally {
        await client.end();
    }
}
async function inspectDomainIntegrity(database) {
    const client = new pg.Client({ ...db, database });
    await client.connect();
    try {
        const result = await client.query(`SELECT
      (SELECT count(*)::int FROM registration_requests) AS registrations,
      ((SELECT count(*)::int FROM registration_requests WHERE "pdfFileId" IS NOT NULL)
        + (SELECT count(*)::int FROM registration_evidence WHERE "removedAt" IS NULL)) AS "registrationFiles",
      (SELECT count(*)::int FROM service_requests) AS "serviceRequests",
      (SELECT count(*)::int FROM ticket_messages WHERE "storedFileId" IS NOT NULL) AS "ticketFiles",
      (SELECT count(*)::int FROM audit_events) AS "auditEvents",
      (SELECT count(*)::int FROM admin_users) AS admins,
      (SELECT count(*)::int FROM admin_user_roles) AS roles,
      (SELECT count(*)::int FROM customer_web_sessions) AS "webSessions"`);
        return result.rows[0];
    } finally {
        await client.end();
    }
}
async function databaseExists(database) {
    const client = new pg.Client({ ...db, database: 'postgres' });
    await client.connect();
    try {
        return (
            (
                await client.query(
                    'SELECT 1 FROM pg_database WHERE datname=$1',
                    [database],
                )
            ).rowCount === 1
        );
    } finally {
        await client.end();
    }
}
async function listPhysicalFiles(root) {
    const result = [];
    for (const file of walk(root))
        result.push({
            objectKey: path.relative(root, file).replaceAll('\\', '/'),
            sizeBytes: fs.statSync(file).size,
            sha256: await checksum(file),
        });
    return result.sort((a, b) => a.objectKey.localeCompare(b.objectKey));
}
function* walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (entry.isFile()) yield full;
    }
}
async function checksum(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}
async function assertChecksum(file, expected) {
    if (!fs.existsSync(file) || (await checksum(file)) !== expected)
        fail(`Checksum mismatch: ${file}`);
}
function run(command, args) {
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        windowsHide: true,
    });
    if (result.status !== 0)
        fail(`${command} failed with exit code ${result.status}`);
}
function required(name) {
    const value = option(name);
    if (!value) fail(`Missing required option ${name}`);
    return value;
}
function fail(message) {
    throw new Error(message);
}
function portOpen(port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
        socket.setTimeout(500, () => {
            socket.destroy();
            resolve(false);
        });
    });
}
