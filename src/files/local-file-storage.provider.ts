import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileStoragePort, StoredObject } from './file-storage.types';

@Injectable()
export class LocalFileStorageProvider implements FileStoragePort {
    private readonly root: string;

    constructor(config: ConfigService) {
        const configured = config.get<string>('FILE_STORAGE_ROOT') || path.join(process.cwd(), 'storage');
        this.root = path.resolve(configured);
        fs.mkdirSync(this.root, { recursive: true });
    }

    resolveObjectKey(objectKey: string) {
        if (!objectKey || path.isAbsolute(objectKey) || objectKey.includes('\0')) {
            throw new Error('Invalid storage object key');
        }
        const normalized = objectKey.replaceAll('\\', '/');
        if (normalized.split('/').some((part) => part === '..' || part === '.')) {
            throw new Error('Storage object key escapes storage root');
        }
        const resolved = path.resolve(this.root, ...normalized.split('/'));
        const relative = path.relative(this.root, resolved);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Storage object key escapes storage root');
        }
        return resolved;
    }

    async write(objectKey: string, source: Readable, maxBytes: number): Promise<StoredObject> {
        const target = this.resolveObjectKey(objectKey);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
        const hash = createHash('sha256');
        let sizeBytes = 0;
        const meter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                sizeBytes += chunk.length;
                if (sizeBytes > maxBytes) return callback(new Error('File exceeds the configured size limit'));
                hash.update(chunk);
                callback(null, chunk);
            },
        });
        try {
            await pipeline(source, meter, fs.createWriteStream(temporary, { flags: 'wx' }));
            await fs.promises.rename(temporary, target);
            return { objectKey, sizeBytes, sha256: hash.digest('hex') };
        } catch (error) {
            await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
            throw error;
        }
    }

    openRead(objectKey: string) {
        return Promise.resolve(
            fs.createReadStream(this.resolveObjectKey(objectKey)),
        );
    }

    async exists(objectKey: string) {
        try {
            await fs.promises.access(this.resolveObjectKey(objectKey));
            return true;
        } catch {
            return false;
        }
    }

    async checksum(objectKey: string) {
        const hash = createHash('sha256');
        await pipeline(await this.openRead(objectKey), new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                hash.update(chunk);
                callback();
            },
        }));
        return hash.digest('hex');
    }

    async remove(objectKey: string) {
        await fs.promises.rm(this.resolveObjectKey(objectKey), { force: true });
    }
}
