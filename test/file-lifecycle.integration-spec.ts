/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { type INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource, Repository } from 'typeorm';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FileLifecycleService } from '../src/files/file-lifecycle.service';
import {
    FILE_STORAGE_PORT,
    type FileStoragePort,
} from '../src/files/file-storage.types';
import { FilesService } from '../src/files/files.service';
import { StoredFileReferenceInspector } from '../src/files/stored-file-reference-inspector';

process.env.FILE_LIFECYCLE_TEMP_GRACE_MS = '60000';
process.env.FILE_LIFECYCLE_PENDING_GRACE_MS = '60000';
process.env.FILE_LIFECYCLE_ACTIVE_ORPHAN_GRACE_MS = '60000';
process.env.FILE_LIFECYCLE_PURGE_GRACE_MS = '60000';
process.env.FILE_LIFECYCLE_PHYSICAL_ORPHAN_GRACE_MS = '60000';

describe('file lifecycle reconciliation on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let lifecycle: FileLifecycleService;
    let inspector: StoredFileReferenceInspector;
    let filesService: FilesService;
    let storage: FileStoragePort;
    let files: Repository<StoredFileEntity>;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        lifecycle = app.get(FileLifecycleService);
        inspector = app.get(StoredFileReferenceInspector);
        filesService = app.get(FilesService);
        storage = app.get(FILE_STORAGE_PORT);
        files = dataSource.getRepository(StoredFileEntity);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations' ORDER BY table_name`,
        );
        await dataSource.query(
            `TRUNCATE TABLE ${tables
                .map(
                    ({ table_name }) =>
                        `"public"."${table_name.replaceAll('"', '""')}"`,
                )
                .join(', ')} RESTART IDENTITY CASCADE`,
        );
        fs.rmSync(process.env.FILE_STORAGE_ROOT as string, {
            recursive: true,
            force: true,
        });
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    async function stored(input: {
        key: string;
        status?: StoredFileEntity['status'];
        content?: Buffer;
        physical?: boolean;
        sha256?: string;
        createdAt?: Date;
        purgeAfter?: Date;
    }) {
        const content = input.content ?? Buffer.from(`content:${input.key}`);
        const physical = input.physical ?? true;
        const object = physical
            ? await storage.write(
                  input.key,
                  Readable.from(content),
                  content.length + 1,
              )
            : {
                  objectKey: input.key,
                  sizeBytes: content.length,
                  sha256: '0'.repeat(63) + (content.length % 10).toString(),
              };
        const file = await files.save(
            files.create({
                provider: 'local',
                objectKey: object.objectKey,
                originalName: 'file.bin',
                mimeType: 'application/octet-stream',
                sizeBytes: String(object.sizeBytes),
                sha256: input.sha256 ?? object.sha256,
                status: input.status ?? 'active',
                createdByStaffId: null,
                createdByCustomerId: null,
                metadata: { purpose: 'test' },
                purgeAfter: input.purgeAfter ?? null,
            }),
        );
        if (input.createdAt) {
            await files.update(file.id, { createdAt: input.createdAt });
            file.createdAt = input.createdAt;
        }
        return file;
    }

    async function referenceFromSupport(fileId: number, suffix: string) {
        const resources = await dataSource.query<Array<{ id: number }>>(
            `INSERT INTO support_resources (slug, title, type)
             VALUES ($1, $2, 'driver') RETURNING id`,
            [`lifecycle-${suffix}`, `Lifecycle ${suffix}`],
        );
        await dataSource.query(
            `INSERT INTO support_resource_versions
             ("resourceId", platform, architecture, "languageCode",
              "distributionMode", "storedFileId")
             VALUES ($1, 'windows', 'x64', 'ru', 'hosted', $2)`,
            [resources[0].id, fileId],
        );
    }

    it('discovers every current PostgreSQL FK reference surface generically', async () => {
        const references = await inspector.discover();
        const surfaces = new Set(
            references.map(
                (reference) => `${reference.tableName}.${reference.columnName}`,
            ),
        );
        expect(surfaces.size).toBeGreaterThanOrEqual(11);
        for (const expected of [
            'ticket_messages.storedFileId',
            'service_requests.invoiceStoredFileId',
            'service_requests.paymentProofFileId',
            'service_requests.generatedConsentFileId',
            'service_requests.signedConsentFileId',
            'service_request_messages.storedFileId',
            'service_request_attachments.storedFileId',
            'registration_requests.pdfFileId',
            'registration_evidence.storedFileId',
            'outbound_deliveries.storedFileId',
            'support_resource_versions.storedFileId',
        ]) {
            expect(surfaces.has(expected)).toBe(true);
        }
    });

    it('does not mark a concurrently created file missing from a stale inventory snapshot', async () => {
        const snapshotTaken = barrier();
        const continueInventory = barrier();
        const inventory = jest
            .spyOn(storage, 'listEntries')
            .mockImplementation(() =>
                (async function* () {
                    snapshotTaken.release();
                    await continueInventory.promise;
                    yield* [];
                })(),
            );
        const content = Buffer.from('%PDF-1.4\nconcurrent file');

        try {
            const reconciliation = lifecycle.reconcile({ apply: true });
            await snapshotTaken.promise;
            const file = await filesService.saveBuffer({
                purpose: 'service-attachment',
                buffer: content,
                originalName: 'concurrent.pdf',
                mimeType: 'application/pdf',
            });
            continueInventory.release();

            const report = await reconciliation;
            const row = await files.findOneByOrFail({ id: file.id });
            expect(report.missing).not.toContainEqual(
                expect.objectContaining({ fileId: file.id }),
            );
            expect(row).toMatchObject({ status: 'active', missingAt: null });
            expect(await storage.exists(file.objectKey)).toBe(true);

            const opened = await filesService.open(file.id);
            const chunks: Buffer[] = [];
            for await (const chunk of opened.stream) {
                chunks.push(Buffer.from(chunk as Uint8Array));
            }
            expect(Buffer.concat(chunks)).toEqual(content);
        } finally {
            continueInventory.release();
            inventory.mockRestore();
        }
    });

    it('rechecks physical absence under the row lock before marking missing', async () => {
        const content = Buffer.from('late physical object');
        const file = await stored({
            key: 'test/appears-before-missing-lock',
            physical: false,
        });
        const lockedCheckStarted = barrier();
        const continueLockedCheck = barrier();
        let targetChecks = 0;
        const exists = jest
            .spyOn(storage, 'exists')
            .mockImplementation(async (objectKey) => {
                if (objectKey !== file.objectKey) {
                    return fs.existsSync(storage.resolveObjectKey(objectKey));
                }
                targetChecks += 1;
                if (targetChecks === 1) return false;
                if (targetChecks === 2) {
                    lockedCheckStarted.release();
                    await continueLockedCheck.promise;
                }
                return fs.existsSync(storage.resolveObjectKey(objectKey));
            });

        try {
            const reconciliation = lifecycle.reconcile({ apply: true });
            await lockedCheckStarted.promise;
            await storage.write(
                file.objectKey,
                Readable.from(content),
                content.length + 1,
            );
            continueLockedCheck.release();

            const report = await reconciliation;
            expect(targetChecks).toBe(2);
            expect(report.missing).not.toContainEqual(
                expect.objectContaining({ fileId: file.id }),
            );
            expect(await files.findOneByOrFail({ id: file.id })).toMatchObject({
                status: 'active',
                missingAt: null,
            });
            expect(await storage.exists(file.objectKey)).toBe(true);
        } finally {
            continueLockedCheck.release();
            exists.mockRestore();
        }
    });

    it('keeps dry-run side-effect free and applies stale, orphan, and missing transitions repeatably', async () => {
        const base = new Date('2026-08-26T00:00:00.000Z');
        const now = new Date(base.getTime() + 8 * 24 * 60 * 60 * 1000);
        const active = await stored({
            key: 'test/active-orphan',
            createdAt: base,
        });
        const freshActive = await stored({
            key: 'test/fresh-active',
            createdAt: new Date(now.getTime() - 60_000),
        });
        const missing = await stored({
            key: 'test/missing',
            physical: false,
            createdAt: base,
        });
        const pending = await stored({
            key: 'test/pending',
            status: 'pending',
            createdAt: base,
        });
        const freshPending = await stored({
            key: 'test/fresh-pending',
            status: 'pending',
            createdAt: new Date(now.getTime() - 30_000),
        });
        await storage.write(
            'test/physical-orphan',
            Readable.from(Buffer.from('orphan')),
            100,
        );
        const orphanPath = storage.resolveObjectKey('test/physical-orphan');
        fs.utimesSync(orphanPath, base, base);
        await storage.write(
            'test/recent-physical-orphan',
            Readable.from(Buffer.from('recent')),
            100,
        );
        const recentOrphanPath = storage.resolveObjectKey(
            'test/recent-physical-orphan',
        );
        fs.utimesSync(recentOrphanPath, now, now);
        const temporaryPath = storage.resolveObjectKey(
            'test/interrupted.1.tmp',
        );
        fs.writeFileSync(temporaryPath, 'partial');
        fs.utimesSync(temporaryPath, base, base);
        const recentTemporaryPath =
            storage.resolveObjectKey('test/recent.1.tmp');
        fs.writeFileSync(recentTemporaryPath, 'recent partial');
        fs.utimesSync(recentTemporaryPath, now, now);

        const dry = await lifecycle.reconcile({ now });
        expect(dry.mode).toBe('dry-run');
        expect(dry.activeUnreferenced).toContainEqual(
            expect.objectContaining({ fileId: active.id }),
        );
        expect(dry.missing).toContainEqual(
            expect.objectContaining({ fileId: missing.id }),
        );
        expect(dry.pendingStale).toContainEqual(
            expect.objectContaining({ fileId: pending.id }),
        );
        expect(dry.physicalOrphans).toContainEqual({
            objectKey: 'test/physical-orphan',
        });
        expect(dry.staleTemps).toContainEqual({
            objectKey: 'test/interrupted.1.tmp',
        });
        expect(dry.activeUnreferenced).not.toContainEqual(
            expect.objectContaining({ fileId: freshActive.id }),
        );
        expect(dry.pendingStale).not.toContainEqual(
            expect.objectContaining({ fileId: freshPending.id }),
        );
        expect((await files.findOneByOrFail({ id: active.id })).status).toBe(
            'active',
        );
        expect(fs.existsSync(orphanPath)).toBe(true);

        const applied = await lifecycle.reconcile({ apply: true, now });
        expect(applied.errors).toEqual([]);
        expect(await files.findOneByOrFail({ id: active.id })).toMatchObject({
            status: 'deleted',
            deletedAt: expect.any(Date),
            purgeAfter: expect.any(Date),
            purgedAt: null,
        });
        expect(await files.findOneByOrFail({ id: missing.id })).toMatchObject({
            status: 'missing',
            missingAt: expect.any(Date),
        });
        expect(await files.findOneByOrFail({ id: pending.id })).toMatchObject({
            status: 'rejected',
            purgeAfter: expect.any(Date),
        });
        expect(fs.existsSync(orphanPath)).toBe(false);
        expect(fs.existsSync(temporaryPath)).toBe(false);
        expect(fs.existsSync(recentOrphanPath)).toBe(true);
        expect(fs.existsSync(recentTemporaryPath)).toBe(true);

        await lifecycle.reconcile({
            apply: true,
            now: new Date(now.getTime() + 60 * 60 * 1000),
        });
        expect(await storage.exists(active.objectKey)).toBe(true);
        expect((await files.findOneByOrFail({ id: active.id })).purgedAt).toBe(
            null,
        );

        const purgeNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const purged = await lifecycle.reconcile({
            apply: true,
            now: purgeNow,
        });
        expect(purged.purged.map((item) => item.fileId)).toEqual(
            expect.arrayContaining([active.id, pending.id]),
        );
        const repeated = await lifecycle.reconcile({
            apply: true,
            now: purgeNow,
        });
        expect(repeated.purged).toEqual([]);
        await expect(filesService.open(missing.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const missingAt = (await files.findOneByOrFail({ id: missing.id }))
            .missingAt;
        await lifecycle.reconcile({ apply: true, now: purgeNow });
        expect(
            (await files.findOneByOrFail({ id: missing.id })).missingAt,
        ).toEqual(missingAt);
    });

    it('normalizes CLI-like string durations before scheduling and applying a purge', async () => {
        const fixedNow = new Date('2026-08-26T00:00:00.000Z');
        const cliLifecycle = lifecycleWithConfig({
            FILE_LIFECYCLE_TEMP_GRACE_MS: '3600000',
            FILE_LIFECYCLE_PENDING_GRACE_MS: '3600000',
            FILE_LIFECYCLE_ACTIVE_ORPHAN_GRACE_MS: '604800000',
            FILE_LIFECYCLE_PURGE_GRACE_MS: '86400000',
            FILE_LIFECYCLE_PHYSICAL_ORPHAN_GRACE_MS: '86400000',
        });
        const pending = await stored({
            key: 'test/cli-string-duration',
            status: 'pending',
            createdAt: new Date(fixedNow.getTime() - 3_600_001),
        });

        const applied = await cliLifecycle.reconcile({
            apply: true,
            now: fixedNow,
        });
        expect(applied.pendingStale).toContainEqual(
            expect.objectContaining({ fileId: pending.id }),
        );
        const rejected = await files.findOneByOrFail({ id: pending.id });
        expect(rejected.status).toBe('rejected');
        expect(rejected.purgeAfter).toBeInstanceOf(Date);
        expect(rejected.purgeAfter?.getTime()).toBe(
            fixedNow.getTime() + 86_400_000,
        );
        expect(await storage.exists(pending.objectKey)).toBe(true);

        await cliLifecycle.reconcile({
            apply: true,
            now: new Date(fixedNow.getTime() + 86_400_000 - 1),
        });
        expect(await storage.exists(pending.objectKey)).toBe(true);
        expect(
            (await files.findOneByOrFail({ id: pending.id })).purgedAt,
        ).toBeNull();

        const purgeNow = new Date(fixedNow.getTime() + 86_400_000 + 1);
        const purged = await cliLifecycle.reconcile({
            apply: true,
            now: purgeNow,
        });
        expect(purged.purged).toContainEqual(
            expect.objectContaining({ fileId: pending.id }),
        );
        expect(await storage.exists(pending.objectKey)).toBe(false);
        expect(
            (await files.findOneByOrFail({ id: pending.id })).purgedAt,
        ).toEqual(purgeNow);
    });

    it.each(['not-a-number', 'Infinity', '1.5', '-1'])(
        'rejects invalid explicit lifecycle duration %s before mutation',
        async (invalidPurgeGrace) => {
            const fixedNow = new Date('2026-08-26T00:00:00.000Z');
            const cliLifecycle = lifecycleWithConfig({
                FILE_LIFECYCLE_PENDING_GRACE_MS: '3600000',
                FILE_LIFECYCLE_PURGE_GRACE_MS: invalidPurgeGrace,
            });
            const pending = await stored({
                key: `test/invalid-purge-grace-${invalidPurgeGrace}`,
                status: 'pending',
                createdAt: new Date(fixedNow.getTime() - 3_600_001),
            });

            await expect(
                cliLifecycle.reconcile({ apply: true, now: fixedNow }),
            ).rejects.toThrow('Invalid FILE_LIFECYCLE_PURGE_GRACE_MS');
            expect(
                await files.findOneByOrFail({ id: pending.id }),
            ).toMatchObject({
                status: 'pending',
                deletedAt: null,
                purgeAfter: null,
            });
            expect(await storage.exists(pending.objectKey)).toBe(true);
        },
    );

    it('verifies checksums, marks corruption, and never purges referenced files', async () => {
        const base = new Date('2026-08-26T00:00:00.000Z');
        const now = new Date(base.getTime() + 8 * 24 * 60 * 60 * 1000);
        const healthy = await stored({
            key: 'test/healthy',
            createdAt: base,
        });
        const corrupt = await stored({
            key: 'test/corrupt',
            createdAt: base,
        });
        fs.writeFileSync(
            storage.resolveObjectKey(corrupt.objectKey),
            'tampered',
        );
        await referenceFromSupport(healthy.id, 'healthy');
        await referenceFromSupport(corrupt.id, 'corrupt');

        const report = await lifecycle.reconcile({
            apply: true,
            verifyChecksums: true,
            now,
        });
        expect(report.corrupt).toContainEqual(
            expect.objectContaining({ fileId: corrupt.id }),
        );
        expect(
            (await files.findOneByOrFail({ id: healthy.id })).lastVerifiedAt,
        ).toEqual(now);
        const corruptRow = await files.findOneByOrFail({ id: corrupt.id });
        expect(corruptRow).toMatchObject({
            status: 'corrupt',
            corruptAt: now,
            purgeAfter: expect.any(Date),
        });

        const purge = await lifecycle.reconcile({
            apply: true,
            now: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        });
        expect(purge.blockedByReference).toContainEqual(
            expect.objectContaining({ fileId: corrupt.id }),
        );
        expect(await storage.exists(corrupt.objectKey)).toBe(true);
        expect((await files.findOneByOrFail({ id: corrupt.id })).purgedAt).toBe(
            null,
        );
    });

    it('does not reset logical-delete grace and does not mask purge failures', async () => {
        const file = await stored({ key: 'test/logical-delete' });
        const first = await filesService.logicalDelete(file.id);
        const firstPurgeAfter = first.purgeAfter;
        const second = await filesService.logicalDelete(file.id);
        expect(second.purgeAfter).toEqual(firstPurgeAfter);

        await files.update(file.id, {
            purgeAfter: new Date('2026-08-26T00:00:00.000Z'),
        });
        const remove = jest
            .spyOn(storage, 'remove')
            .mockRejectedValueOnce(new Error('synthetic removal failure'));
        const report = await lifecycle.reconcile({
            apply: true,
            now: new Date('2026-08-26T00:02:00.000Z'),
        });
        expect(report.errors).toContainEqual(
            expect.objectContaining({
                fileId: file.id,
                operation: 'tracked.purge',
            }),
        );
        expect((await files.findOneByOrFail({ id: file.id })).purgedAt).toBe(
            null,
        );
        remove.mockRestore();
    });

    function lifecycleWithConfig(values: Record<string, string>) {
        return new FileLifecycleService(
            dataSource,
            files,
            storage,
            new ConfigService(values),
            inspector,
        );
    }
});

function barrier(): { promise: Promise<void>; release: () => void } {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
