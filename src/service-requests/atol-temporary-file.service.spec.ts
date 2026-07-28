import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { AtolTemporaryFileService } from './atol-temporary-file.service';

describe('AtolTemporaryFileService', () => {
    let root: string;
    let service: AtolTemporaryFileService;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'atol-cleanup-'),
        );
        service = new AtolTemporaryFileService({ get: () => root } as never);
    });

    afterEach(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    it('removes a temporary file after success and supports repeated cleanup', async () => {
        const file = path.join(root, 'consent.pdf');
        await fs.promises.writeFile(file, 'temporary');

        await expect(service.remove(file)).resolves.toBe(true);
        await expect(service.remove(file)).resolves.toBe(true);
        await expect(fs.promises.stat(file)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('does not delete a final stored file outside the temporary root', async () => {
        const finalFile = path.join(
            path.dirname(root),
            `stored-${path.basename(root)}.pdf`,
        );
        await fs.promises.writeFile(finalFile, 'stored');
        try {
            await expect(service.remove(finalFile)).rejects.toBeInstanceOf(
                BadRequestException,
            );
            await expect(fs.promises.readFile(finalFile, 'utf8')).resolves.toBe(
                'stored',
            );
        } finally {
            await fs.promises.rm(finalFile, { force: true });
        }
    });

    it('logs deletion failures without throwing', async () => {
        const directory = path.join(root, 'not-a-file');
        await fs.promises.mkdir(directory);
        await fs.promises.writeFile(path.join(directory, 'child'), 'x');

        await expect(service.remove(directory)).resolves.toBe(false);
    });
});
