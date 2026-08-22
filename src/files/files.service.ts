import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoredFileEntity } from './entities/stored-file.entity';
import { assertFilePolicy, FILE_POLICIES } from './file-policies';
import {
    FILE_STORAGE_PORT,
    type FilePurpose,
    type FileStoragePort,
} from './file-storage.types';

@Injectable()
export class FilesService {
    constructor(
        @InjectRepository(StoredFileEntity)
        private readonly files: Repository<StoredFileEntity>,
        @Inject(FILE_STORAGE_PORT)
        private readonly storage: FileStoragePort,
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
                await this.files.save(file);
            }
            throw new NotFoundException('File content is unavailable');
        }
        return { file, stream: await this.storage.openRead(file.objectKey) };
    }

    async verify(id: number) {
        const file = await this.get(id);
        return (await this.storage.checksum(file.objectKey)) === file.sha256;
    }

    async logicalDelete(id: number) {
        const file = await this.get(id);
        file.status = 'deleted';
        return this.files.save(file);
    }

    getPolicy(purpose: FilePurpose) {
        return FILE_POLICIES[purpose];
    }

    private safeOriginalName(value?: string) {
        const name = path
            .basename((value || 'file').replaceAll('\0', ''))
            .trim();
        if (!name) throw new BadRequestException('Invalid original filename');
        return name.slice(0, 255);
    }
}
