import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
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
        const stored = await provider.write('ticket-image/2026/07/file-id', Readable.from(Buffer.from('hello')), 100);
        expect(stored.sizeBytes).toBe(5);
        expect(stored.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
        const chunks: Buffer[] = [];
        const stream = (await provider.openRead(
            stored.objectKey,
        )) as AsyncIterable<Buffer>;
        for await (const chunk of stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('hello');
    });

    it.each(['../secret', '/absolute/file', 'C:\\absolute\\file', 'safe/../../secret'])(
        'rejects unsafe object key %s',
        (key) => expect(() => provider.resolveObjectKey(key)).toThrow(),
    );

    it('removes a temporary file when the size limit fails', async () => {
        await expect(provider.write('ticket-image/file', Readable.from(Buffer.alloc(20)), 10)).rejects.toThrow();
        expect([...walk(root)]).toEqual([]);
    });
});

function* walk(directory: string): Generator<string> {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}
