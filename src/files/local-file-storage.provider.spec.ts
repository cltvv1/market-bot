import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import type { StorageEntry } from './file-storage.types';
import { LocalFileStorageProvider } from './local-file-storage.provider';

describe('LocalFileStorageProvider', () => {
    let root: string;
    let provider: LocalFileStorageProvider;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitma-files-'));
        provider = new LocalFileStorageProvider({
            get: () => root,
        } as unknown as ConfigService);
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('writes and reads a stream with checksum', async () => {
        const stored = await provider.write(
            'ticket-image/2026/07/file-id',
            Readable.from(Buffer.from('hello')),
            100,
        );
        expect(stored.sizeBytes).toBe(5);
        expect(stored.sha256).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        );
        const chunks: Buffer[] = [];
        const stream = (await provider.openRead(
            stored.objectKey,
        )) as AsyncIterable<Buffer>;
        for await (const chunk of stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('hello');
    });

    it.each([
        '../secret',
        '/absolute/file',
        'C:\\absolute\\file',
        'safe/../../secret',
    ])('rejects unsafe object key %s', (key) =>
        expect(() => provider.resolveObjectKey(key)).toThrow(),
    );

    it('removes a temporary file when the size limit fails', async () => {
        await expect(
            provider.write(
                'ticket-image/file',
                Readable.from(Buffer.alloc(20)),
                10,
            ),
        ).rejects.toThrow();
        expect([...walk(root)]).toEqual([]);
    });

    it('inventories object and temporary entries without absolute paths', async () => {
        await provider.write(
            'support-resource/2026/08/file-id',
            Readable.from(Buffer.from('hello')),
            100,
        );
        const temporary = provider.resolveObjectKey(
            'support-resource/2026/08/interrupted.1.tmp',
        );
        fs.writeFileSync(temporary, 'partial');
        const entries: StorageEntry[] = [];
        for await (const entry of provider.listEntries()) entries.push(entry);
        expect(entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    objectKey: 'support-resource/2026/08/file-id',
                    kind: 'object',
                    sizeBytes: 5,
                }),
                expect.objectContaining({
                    objectKey: 'support-resource/2026/08/interrupted.1.tmp',
                    kind: 'temporary',
                    sizeBytes: 7,
                }),
            ]),
        );
        expect(
            entries.every((entry) => !path.isAbsolute(entry.objectKey)),
        ).toBe(true);
    });

    it('does not follow directory symlinks during inventory', async () => {
        const outside = fs.mkdtempSync(
            path.join(os.tmpdir(), 'vitma-outside-'),
        );
        try {
            fs.writeFileSync(path.join(outside, 'secret.bin'), 'secret');
            const link = path.join(root, 'linked-outside');
            fs.symlinkSync(outside, link, 'junction');
            const entries: StorageEntry[] = [];
            for await (const entry of provider.listEntries()) {
                entries.push(entry);
            }
            expect(entries).toEqual([]);
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });
});

function* walk(directory: string): Generator<string> {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}
