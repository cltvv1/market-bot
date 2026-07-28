import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('backup verification', () => {
    let root: string;
    let backup: string;
    let dumpPath: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitma-backup-test-'));
        backup = path.join(root, 'backup');
        const storage = path.join(root, 'storage');
        fs.mkdirSync(backup, { recursive: true });
        fs.mkdirSync(path.join(storage, 'documents'), { recursive: true });

        dumpPath = path.join(backup, 'database.dump');
        const storedPath = path.join(storage, 'documents', 'example.txt');
        const archivePath = path.join(backup, 'storage.tar.gz');
        fs.writeFileSync(dumpPath, 'offline database fixture');
        fs.writeFileSync(storedPath, 'stored file fixture');
        runTar(['-czf', archivePath, '-C', storage, '.']);

        fs.writeFileSync(
            path.join(backup, 'manifest.json'),
            JSON.stringify({
                formatVersion: 1,
                application: 'vitma-market',
                database: {
                    dump: 'database.dump',
                    sha256: checksum(dumpPath),
                    migrations: [],
                },
                storage: {
                    archive: 'storage.tar.gz',
                    archiveSha256: checksum(archivePath),
                    files: [
                        {
                            objectKey: 'documents/example.txt',
                            sizeBytes: fs.statSync(storedPath).size,
                            sha256: checksum(storedPath),
                        },
                    ],
                },
            }),
        );
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('verifies checksums and restores the storage archive into an isolated directory', () => {
        const result = verify();

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Backup verified');
    });

    it('rejects a backup whose database dump was modified', () => {
        fs.appendFileSync(dumpPath, 'tampered');

        const result = verify();

        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain(
            'Checksum mismatch',
        );
    });

    function verify() {
        return spawnSync(
            process.execPath,
            ['scripts/backup.mjs', 'verify', '--backup', backup],
            {
                cwd: path.resolve(__dirname, '..'),
                encoding: 'utf8',
                windowsHide: true,
            },
        );
    }
});

function checksum(filePath: string) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runTar(arguments_: string[]) {
    const command = process.platform === 'win32' ? 'tar.exe' : 'tar';
    const result = spawnSync(command, arguments_, {
        encoding: 'utf8',
        windowsHide: true,
    });
    if (result.status !== 0) {
        throw new Error(`${command} failed: ${result.stderr}`);
    }
}
