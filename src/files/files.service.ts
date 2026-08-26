import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { SupportResourceType } from 'src/support-knowledge/support-knowledge.types';
import { type EntityManager, Repository } from 'typeorm';
import { StoredFileEntity } from './entities/stored-file.entity';
import { assertFilePolicy, FILE_POLICIES } from './file-policies';
import {
    FILE_STORAGE_PORT,
    FileSizeLimitError,
    type FilePurpose,
    type FileStoragePort,
    type StoredObject,
} from './file-storage.types';
import {
    SUPPORT_SIGNATURE_PREFIX_BYTES,
    validateSupportFile,
} from './support-file-policy';

@Injectable()
export class FilesService {
    constructor(
        @InjectRepository(StoredFileEntity)
        private readonly files: Repository<StoredFileEntity>,
        @Inject(FILE_STORAGE_PORT)
        private readonly storage: FileStoragePort,
        private readonly config: ConfigService,
    ) {}

    async saveBuffer(input: {
        purpose: FilePurpose;
        buffer: Buffer;
        originalName?: string;
        mimeType?: string;
        serverGenerated?: boolean;
        createdByStaffId?: number;
        createdByCustomerId?: number;
        metadata?: Record<string, unknown>;
    }) {
        if (input.purpose === 'support-resource') {
            throw new BadRequestException(
                'Support resources require the streaming upload workflow',
            );
        }
        const { policy, mime } = assertFilePolicy(
            input.purpose,
            input.buffer,
            input.mimeType,
            input.serverGenerated,
        );
        const now = new Date();
        const objectKey = [
            input.purpose,
            String(now.getUTCFullYear()),
            String(now.getUTCMonth() + 1).padStart(2, '0'),
            randomUUID(),
        ].join('/');
        const stored = await this.storage.write(
            objectKey,
            Readable.from(input.buffer),
            policy.maxBytes,
        );
        try {
            return await this.files.save(
                this.files.create({
                    provider: 'local',
                    objectKey: stored.objectKey,
                    originalName: this.safeOriginalName(input.originalName),
                    mimeType: mime,
                    sizeBytes: String(stored.sizeBytes),
                    sha256: stored.sha256,
                    status: 'active',
                    createdByStaffId: input.createdByStaffId ?? null,
                    createdByCustomerId: input.createdByCustomerId ?? null,
                    metadata: {
                        purpose: input.purpose,
                        ...(input.metadata ?? {}),
                    },
                }),
            );
        } catch (error) {
            await this.storage.remove(objectKey);
            throw error;
        }
    }

    async saveSupportStream(input: {
        source: Readable;
        originalName: string;
        declaredMime?: string;
        declaredSize?: number;
        resourceId: number;
        versionId: number;
        resourceType: SupportResourceType;
        createdByStaffId: number;
    }) {
        const maxBytes = this.getSupportMaxBytes();
        if (input.declaredSize !== undefined && input.declaredSize > maxBytes) {
            throw new PayloadTooLargeException(
                'File exceeds the configured size limit',
            );
        }
        const { prefix, replay } = await readPrefix(
            input.source,
            SUPPORT_SIGNATURE_PREFIX_BYTES,
        );
        const validated = validateSupportFile(
            prefix,
            input.originalName,
            input.declaredMime,
            input.resourceType,
        );
        const now = new Date();
        const objectKey = [
            'support-resource',
            String(now.getUTCFullYear()),
            String(now.getUTCMonth() + 1).padStart(2, '0'),
            randomUUID(),
        ].join('/');
        let stored: StoredObject;
        try {
            stored = await this.storage.write(objectKey, replay, maxBytes);
        } catch (error) {
            if (error instanceof FileSizeLimitError) {
                throw new PayloadTooLargeException(
                    'File exceeds the configured size limit',
                );
            }
            throw error;
        }
        try {
            return await this.files.save(
                this.files.create({
                    provider: 'local',
                    objectKey: stored.objectKey,
                    originalName: validated.originalName,
                    mimeType: validated.mimeType,
                    sizeBytes: String(stored.sizeBytes),
                    sha256: stored.sha256,
                    status: 'pending',
                    createdByStaffId: input.createdByStaffId,
                    createdByCustomerId: null,
                    metadata: {
                        purpose: 'support-resource',
                        supportResourceId: input.resourceId,
                        supportResourceVersionId: input.versionId,
                        supportResourceType: input.resourceType,
                        detectedFileKind: validated.kind,
                    },
                }),
            );
        } catch (error) {
            await this.storage.remove(objectKey);
            throw error;
        }
    }

    async get(id: number) {
        const file = await this.files.findOne({ where: { id } });
        if (!file) throw new NotFoundException('File was not found');
        return file;
    }

    async open(id: number) {
        const file = await this.get(id);
        if (
            file.status !== 'active' ||
            !(await this.storage.exists(file.objectKey))
        ) {
            if (file.status === 'active') {
                file.status = 'missing';
                file.missingAt ??= new Date();
                await this.files.save(file);
            }
            throw new NotFoundException('File content is unavailable');
        }
        return { file, stream: await this.storage.openRead(file.objectKey) };
    }

    async verify(id: number) {
        const file = await this.get(id);
        if (!(await this.storage.exists(file.objectKey))) {
            if (file.status === 'active') file.status = 'missing';
            file.missingAt ??= new Date();
            await this.files.save(file);
            return false;
        }
        let checksum: string;
        try {
            checksum = await this.storage.checksum(file.objectKey);
        } catch (error) {
            if (!(await this.storage.exists(file.objectKey))) {
                if (file.status === 'active') file.status = 'missing';
                file.missingAt ??= new Date();
                await this.files.save(file);
                return false;
            }
            throw error;
        }
        const matches = checksum === file.sha256;
        if (matches) {
            file.lastVerifiedAt = new Date();
        } else {
            file.status = 'corrupt';
            file.corruptAt ??= new Date();
            file.purgeAfter ??= this.purgeDate();
        }
        await this.files.save(file);
        return matches;
    }

    async logicalDelete(id: number) {
        const file = await this.get(id);
        if (file.deletedAt) return file;
        file.status = 'deleted';
        file.deletedAt = new Date();
        file.purgeAfter = this.purgeDate(file.deletedAt);
        return this.files.save(file);
    }

    getSupportMaxBytes() {
        return (
            this.config.get<number>('SUPPORT_FILE_MAX_BYTES') ??
            512 * 1024 * 1024
        );
    }

    exists(file: Pick<StoredFileEntity, 'objectKey'>) {
        return this.storage.exists(file.objectKey);
    }

    openStoredFile(file: StoredFileEntity) {
        return this.storage.openRead(file.objectKey);
    }

    async rejectPending(
        file: StoredFileEntity,
        manager: EntityManager,
        now = new Date(),
    ) {
        if (file.status !== 'pending') return file;
        file.status = 'rejected';
        file.deletedAt ??= now;
        file.purgeAfter ??= this.purgeDate(now);
        return manager.getRepository(StoredFileEntity).save(file);
    }

    getPolicy(purpose: FilePurpose) {
        return FILE_POLICIES[purpose];
    }

    private purgeDate(from = new Date()) {
        const grace =
            this.config.get<number>('FILE_LIFECYCLE_PURGE_GRACE_MS') ??
            86_400_000;
        return new Date(from.getTime() + grace);
    }

    private safeOriginalName(value?: string) {
        const name = path
            .basename((value || 'file').replaceAll('\0', ''))
            .trim();
        if (!name) throw new BadRequestException('Invalid original filename');
        return name.slice(0, 255);
    }
}

async function readPrefix(source: Readable, maxBytes: number) {
    const iterator = source[Symbol.asyncIterator]();
    const consumed: Buffer[] = [];
    const prefixParts: Buffer[] = [];
    let prefixSize = 0;
    while (prefixSize < maxBytes) {
        const result = await iterator.next();
        if (result.done) break;
        const chunk = Buffer.isBuffer(result.value)
            ? result.value
            : Buffer.from(result.value as Uint8Array);
        consumed.push(chunk);
        const remaining = maxBytes - prefixSize;
        const prefixChunk = chunk.subarray(0, remaining);
        prefixParts.push(prefixChunk);
        prefixSize += prefixChunk.length;
    }
    const replay = Readable.from(
        (async function* () {
            for (const chunk of consumed) yield chunk;
            while (true) {
                const result = await iterator.next();
                if (result.done) return;
                yield result.value;
            }
        })(),
    );
    return { prefix: Buffer.concat(prefixParts, prefixSize), replay };
}
