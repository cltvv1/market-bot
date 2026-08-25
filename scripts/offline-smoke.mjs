import 'dotenv/config';
import { pbkdf2Sync } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

const testDatabase = process.env.TEST_DB_NAME?.trim();
if (!testDatabase) {
    throw new Error('TEST_DB_NAME is required for offline smoke');
}

const port = Number(process.env.OFFLINE_SMOKE_PORT || 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const smokeLogin = 'ci-smoke-admin';
const smokePassword = 'CI-Smoke-Password-42!';
await ensureSmokeAdmin();
const child = spawn(process.execPath, ['dist/src/main.js'], {
    env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        BOT_POLLING_ENABLED: 'false',
        OUTBOUND_DELIVERY_WORKER_ENABLED: 'false',
        MAX_BOT_TOKEN: '',
        SERVE_BUILT_UI: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
});
let output = '';
child.stdout.on('data', (chunk) => {
    output += chunk;
});
child.stderr.on('data', (chunk) => {
    output += chunk;
});

try {
    await waitFor(`${baseUrl}/health/live`);
    for (const endpoint of [
        '/health/live',
        '/health/ready',
        '/site',
        '/site/catalog',
        '/admin',
    ]) {
        const response = await fetch(`${baseUrl}${endpoint}`);
        if (!response.ok)
            throw new Error(`${endpoint} returned ${response.status}`);
        if (
            (endpoint.startsWith('/site') || endpoint === '/admin') &&
            !(response.headers.get('content-type') || '').startsWith(
                'text/html',
            )
        ) {
            throw new Error(`${endpoint} did not return React HTML`);
        }
    }

    const browser = spawnSync(
        process.execPath,
        ['scripts/ui-browser-smoke.mjs'],
        {
            env: {
                ...process.env,
                UI_SMOKE_BASE_URL: baseUrl,
                UI_SMOKE_ADMIN_LOGIN: smokeLogin,
                UI_SMOKE_ADMIN_PASSWORD: smokePassword,
            },
            encoding: 'utf8',
            windowsHide: true,
        },
    );
    process.stdout.write(browser.stdout || '');
    process.stderr.write(browser.stderr || '');
    if (browser.status !== 0) {
        throw new Error(
            `Browser smoke failed with exit code ${browser.status}`,
        );
    }
    process.stdout.write(
        'Offline Nest bootstrap and health/UI smoke passed.\n',
    );
} catch (error) {
    process.stderr.write(output);
    throw error;
} finally {
    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
}

async function ensureSmokeAdmin() {
    const salt = 'ci-offline-smoke-salt';
    const iterations = 1;
    const hash = pbkdf2Sync(
        smokePassword,
        salt,
        iterations,
        32,
        'sha256',
    ).toString('base64url');
    const database = new pg.Client({
        host: process.env.TEST_DB_HOST || process.env.DB_HOST,
        port: Number(process.env.TEST_DB_PORT || process.env.DB_PORT),
        database: testDatabase,
        user: process.env.TEST_DB_USER || process.env.DB_USER,
        password: process.env.TEST_DB_PASS || process.env.DB_PASS,
    });
    await database.connect();
    try {
        const admin = (
            await database.query(
                `INSERT INTO admin_users (login, "displayName", "passwordHash", "isActive")
                 VALUES ($1, 'CI Smoke Admin', $2, true)
                 ON CONFLICT (login) DO UPDATE
                 SET "passwordHash" = EXCLUDED."passwordHash", "isActive" = true
                 RETURNING id`,
                [smokeLogin, `pbkdf2$${iterations}$${salt}$${hash}`],
            )
        ).rows[0];
        await database.query(
            `INSERT INTO admin_user_roles ("userId", role)
             VALUES ($1, 'superadmin')
             ON CONFLICT ("userId", role) DO NOTHING`,
            [admin.id],
        );
    } finally {
        await database.end();
    }
}

async function waitFor(url) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null)
            throw new Error(`Nest exited with code ${child.exitCode}`);
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${url}`);
}
