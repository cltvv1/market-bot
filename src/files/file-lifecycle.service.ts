import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import {
    StoredFileEntity,
    type StoredFileStatus,
} from './entities/stored-file.entity';
import {
    FILE_STORAGE_PORT,
    type FileStoragePort,
    type StorageEntry,
} from './file-storage.types';
import {
    StoredFileReferenceInspector,
    type StoredFileReferenceColumn,
} from './stored-file-reference-inspector';

export interface FileLifecycleOptions {
    apply?: boolean;
    verifyChecksums?: boolean;
    now?: Date;
}

export interface FileLifecycleItem {
    fileId?: number;
    objectKey?: string;
}

export interface BlockedFileLifecycleItem extends FileLifecycleItem {
    references: Array<{ tableName: string; columnName: string }>;
}

export interface FileLifecycleReport {
    mode: 'dry-run' | 'apply';
    verifyChecksums: boolean;
    referenceColumns: Array<{ tableName: string; columnName: string }>;
    staleTemps: FileLifecycleItem[];
    physicalOrphans: FileLifecycleItem[];
    pendingStale: FileLifecycleItem[];
    activeUnreferenced: FileLifecycleItem[];
    missing: FileLifecycleItem[];
    corrupt: FileLifecycleItem[];
    purgeCandidates: FileLifecycleItem[];
    purged: FileLifecycleItem[];
    blockedByReference: BlockedFileLifecycleItem[];
    errors: Array<FileLifecycleItem & { operation: string }>;
}

const TERMINAL_STATUSES = new Set<StoredFileStatus>([
    'deleted',
    'rejected',
    'corrupt',
]);

@Injectable()
export class FileLifecycleService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(StoredFileEntity)
        private readonly files: Repository<StoredFileEntity>,
        @Inject(FILE_STORAGE_PORT)
        private readonly storage: FileStoragePort,
        private readonly config: ConfigService,
        private readonly references: StoredFileReferenceInspector,
    ) {}

    async reconcile(options: FileLifecycleOptions = {}) {
        const apply = options.apply ?? false;
        const verifyChecksums = options.verifyChecksums ?? false;
        const now = options.now ?? new Date();
        const report = emptyReport(apply, verifyChecksums);
        const lock = apply ? await this.acquireLock() : null;
        try {
            const referenceColumns = await this.references.discover();
            report.referenceColumns = referenceColumns.map(referenceSummary);
            const storageEntries = await this.readStorageEntries(report);
            if (!storageEntries) return report;
            const databaseFiles = await this.files.find({
                order: { id: 'ASC' },
            });
            const byObjectKey = new Map(
                databaseFiles.map((file) => [file.objectKey, file]),
            );
            const referencedIds = await this.references.findReferencedIds(
                databaseFiles.map((file) => file.id),
            );
            await this.reconcilePhysicalEntries(
                storageEntries,
                byObjectKey,
                now,
                apply,
                report,
            );
            await this.reconcileRows(
                databaseFiles,
                storageEntries,
                referencedIds,
                now,
                apply,
                verifyChecksums,
                report,
            );
            return report;
        } finally {
            await this.releaseLock(lock);
        }
    }

    private async readStorageEntries(report: FileLifecycleReport) {
        const entries = new Map<string, StorageEntry>();
        try {
            for await (const entry of this.storage.listEntries()) {
                entries.set(entry.objectKey, entry);
            }
        } catch {
            report.errors.push({ operation: 'storage.inventory' });
        }
        return report.errors.length ? null : entries;
    }

    private async reconcilePhysicalEntries(
        entries: Map<string, StorageEntry>,
        databaseFiles: Map<string, StoredFileEntity>,
        now: Date,
        apply: boolean,
        report: FileLifecycleReport,
    ) {
        for (const entry of entries.values()) {
            if (entry.kind === 'temporary') {
                if (!this.isOld(entry.modifiedAt, now, 'TEMP_GRACE_MS')) {
                    continue;
                }
                const item = { objectKey: entry.objectKey };
                report.staleTemps.push(item);
                if (apply) {
                    await this.removeUntracked(
                        entry.objectKey,
                        'temp.remove',
                        item,
                        report,
                    );
                }
                continue;
            }
            if (
                databaseFiles.has(entry.objectKey) ||
                !this.isOld(entry.modifiedAt, now, 'PHYSICAL_ORPHAN_GRACE_MS')
            ) {
                continue;
            }
            const item = { objectKey: entry.objectKey };
            report.physicalOrphans.push(item);
            if (apply) {
                const appeared = await this.files.existsBy({
                    provider: 'local',
                    objectKey: entry.objectKey,
                });
                if (!appeared) {
                    await this.removeUntracked(
                        entry.objectKey,
                        'orphan.remove',
                        item,
                        report,
                    );
                }
            }
        }
    }

    private async reconcileRows(
        files: StoredFileEntity[],
        entries: Map<string, StorageEntry>,
        referencedIds: Set<number>,
        now: Date,
        apply: boolean,
        verifyChecksums: boolean,
        report: FileLifecycleReport,
    ) {
        for (const file of files) {
            if (file.purgedAt) continue;
            const item = { fileId: file.id, objectKey: file.objectKey };
            const exists = entries.get(file.objectKey)?.kind === 'object';
            if (file.status === 'active' && !exists) {
                report.missing.push(item);
                if (apply) await this.markMissing(file.id, now);
                continue;
            }
            if (file.status === 'active' && verifyChecksums && exists) {
                try {
                    const checksum = await this.storage.checksum(
                        file.objectKey,
                    );
                    if (checksum !== file.sha256) {
                        report.corrupt.push(item);
                        if (apply) await this.markCorrupt(file.id, now);
                        continue;
                    }
                    if (apply) await this.markVerified(file.id, now);
                } catch {
                    report.errors.push({
                        ...item,
                        operation: 'checksum.verify',
                    });
                    continue;
                }
            }
            if (
                file.status === 'active' &&
                !referencedIds.has(file.id) &&
                this.isOld(file.createdAt, now, 'ACTIVE_ORPHAN_GRACE_MS')
            ) {
                report.activeUnreferenced.push(item);
                if (apply) await this.rejectActiveOrphan(file.id, now, report);
                continue;
            }
            if (
                file.status === 'pending' &&
                this.isOld(file.createdAt, now, 'PENDING_GRACE_MS')
            ) {
                report.pendingStale.push(item);
                if (apply) await this.rejectPending(file.id, now, report);
                continue;
            }
            if (!TERMINAL_STATUSES.has(file.status)) continue;
            if (!file.purgeAfter) {
                if (apply) await this.schedulePurge(file.id, now);
                continue;
            }
            if (file.purgeAfter > now) continue;
            report.purgeCandidates.push(item);
            if (referencedIds.has(file.id)) {
                await this.addBlocked(file.id, item, report);
                continue;
            }
            if (apply) await this.purge(file.id, now, report);
        }
    }

    private markMissing(fileId: number, now: Date) {
        return this.files.update(
            { id: fileId, status: 'active' },
            { status: 'missing', missingAt: now },
        );
    }

    private markCorrupt(fileId: number, now: Date) {
        return this.files.update(
            { id: fileId, status: 'active' },
            {
                status: 'corrupt',
                corruptAt: now,
                purgeAfter: this.purgeDate(now),
            },
        );
    }

    private markVerified(fileId: number, now: Date) {
        return this.files.update(
            { id: fileId, status: 'active' },
            { lastVerifiedAt: now },
        );
    }

    private rejectActiveOrphan(
        fileId: number,
        now: Date,
        report: FileLifecycleReport,
    ) {
        return this.withLockedFile(fileId, async (manager, file) => {
            if (file.status !== 'active') return;
            const refs = await this.references.findReferences(fileId, manager);
            if (refs.length) {
                this.pushBlocked(file, refs, report);
                return;
            }
            file.status = 'deleted';
            file.deletedAt ??= now;
            file.purgeAfter ??= this.purgeDate(now);
            await manager.save(file);
        });
    }

    private rejectPending(
        fileId: number,
        now: Date,
        report: FileLifecycleReport,
    ) {
        return this.withLockedFile(fileId, async (manager, file) => {
            if (file.status !== 'pending') return;
            const refs = await this.references.findReferences(fileId, manager);
            if (refs.length) {
                this.pushBlocked(file, refs, report);
                return;
            }
            file.status = 'rejected';
            file.deletedAt ??= now;
            file.purgeAfter ??= this.purgeDate(now);
            await manager.save(file);
        });
    }

    private schedulePurge(fileId: number, now: Date) {
        return this.withLockedFile(fileId, async (manager, file) => {
            if (!TERMINAL_STATUSES.has(file.status) || file.purgeAfter) return;
            file.purgeAfter = this.purgeDate(now);
            await manager.save(file);
        });
    }

    private purge(fileId: number, now: Date, report: FileLifecycleReport) {
        return this.withLockedFile(fileId, async (manager, file) => {
            if (
                file.purgedAt ||
                !TERMINAL_STATUSES.has(file.status) ||
                !file.purgeAfter ||
                file.purgeAfter > now
            ) {
                return;
            }
            const refs = await this.references.findReferences(fileId, manager);
            if (refs.length) {
                this.pushBlocked(file, refs, report);
                return;
            }
            try {
                await this.storage.remove(file.objectKey);
            } catch {
                report.errors.push({
                    fileId: file.id,
                    objectKey: file.objectKey,
                    operation: 'tracked.purge',
                });
                return;
            }
            file.purgedAt = now;
            await manager.save(file);
            report.purged.push({
                fileId: file.id,
                objectKey: file.objectKey,
            });
        });
    }

    private async addBlocked(
        fileId: number,
        item: FileLifecycleItem,
        report: FileLifecycleReport,
    ) {
        const refs = await this.references.findReferences(fileId);
        report.blockedByReference.push({
            ...item,
            references: refs.map(referenceSummary),
        });
    }

    private pushBlocked(
        file: StoredFileEntity,
        refs: StoredFileReferenceColumn[],
        report: FileLifecycleReport,
    ) {
        report.blockedByReference.push({
            fileId: file.id,
            objectKey: file.objectKey,
            references: refs.map(referenceSummary),
        });
    }

    private withLockedFile(
        fileId: number,
        operation: (
            manager: EntityManager,
            file: StoredFileEntity,
        ) => Promise<void>,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const file = await manager
                .getRepository(StoredFileEntity)
                .createQueryBuilder('file')
                .setLock('pessimistic_write')
                .where('file.id = :fileId', { fileId })
                .getOne();
            if (file) await operation(manager, file);
        });
    }

    private async removeUntracked(
        objectKey: string,
        operation: string,
        item: FileLifecycleItem,
        report: FileLifecycleReport,
    ) {
        try {
            await this.storage.remove(objectKey);
        } catch {
            report.errors.push({ ...item, operation });
        }
    }

    private isOld(
        date: Date,
        now: Date,
        suffix:
            | 'TEMP_GRACE_MS'
            | 'PENDING_GRACE_MS'
            | 'ACTIVE_ORPHAN_GRACE_MS'
            | 'PHYSICAL_ORPHAN_GRACE_MS',
    ) {
        return date.getTime() <= now.getTime() - this.grace(suffix);
    }

    private purgeDate(now: Date) {
        return new Date(now.getTime() + this.grace('PURGE_GRACE_MS'));
    }

    private grace(suffix: string) {
        const defaults: Record<string, number> = {
            TEMP_GRACE_MS: 3_600_000,
            PENDING_GRACE_MS: 3_600_000,
            ACTIVE_ORPHAN_GRACE_MS: 604_800_000,
            PURGE_GRACE_MS: 86_400_000,
            PHYSICAL_ORPHAN_GRACE_MS: 86_400_000,
        };
        return (
            this.config.get<number>(`FILE_LIFECYCLE_${suffix}`) ??
            defaults[suffix]
        );
    }

    private async acquireLock() {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        const rows = (await runner.query(
            `SELECT pg_try_advisory_lock(
                hashtextextended('vitma:file-lifecycle', 0)
             ) AS acquired`,
        )) as Array<{ acquired: boolean }>;
        if (!rows[0]?.acquired) {
            await runner.release();
            throw new Error('Another file lifecycle apply run is active');
        }
        return runner;
    }

    private async releaseLock(
        runner: ReturnType<DataSource['createQueryRunner']> | null,
    ) {
        if (!runner) return;
        try {
            await runner.query(
                `SELECT pg_advisory_unlock(
                    hashtextextended('vitma:file-lifecycle', 0)
                 )`,
            );
        } finally {
            await runner.release();
        }
    }
}

function emptyReport(
    apply: boolean,
    verifyChecksums: boolean,
): FileLifecycleReport {
    return {
        mode: apply ? 'apply' : 'dry-run',
        verifyChecksums,
        referenceColumns: [],
        staleTemps: [],
        physicalOrphans: [],
        pendingStale: [],
        activeUnreferenced: [],
        missing: [],
        corrupt: [],
        purgeCandidates: [],
        purged: [],
        blockedByReference: [],
        errors: [],
    };
}

function referenceSummary(reference: StoredFileReferenceColumn) {
    return {
        tableName: reference.tableName,
        columnName: reference.columnName,
    };
}
