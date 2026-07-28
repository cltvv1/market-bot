import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
    throw new Error('database-check.mjs must be started through an npm script');
}

run('db:test:reset');
run('migration:test:run');
run('migration:test:run');

const migrationShow = run('migration:test:show', true);
const pending = migrationShow
    .split(/\r?\n/)
    .filter((line) => line.includes('[ ]'));
if (pending.length) {
    throw new Error(`Pending migrations detected:\n${pending.join('\n')}`);
}
if (!migrationShow.includes('[X]')) {
    throw new Error('migration:test:show did not report applied migrations');
}

const schemaLog = run('schema:test:log', true);
if (!schemaLog.includes('Your schema is up to date')) {
    throw new Error(`Schema drift detected:\n${schemaLog}`);
}

process.stdout.write('Database migration and schema drift checks passed.\n');

function run(script, capture = false) {
    const result = spawnSync(process.execPath, [npmCli, 'run', script], {
        encoding: 'utf8',
        env: process.env,
        stdio: capture ? 'pipe' : 'inherit',
        windowsHide: true,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (capture) process.stdout.write(output);
    if (result.status !== 0) {
        throw new Error(`${script} failed with exit code ${result.status}`);
    }
    return output;
}
