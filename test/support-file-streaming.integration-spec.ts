/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import {
    type INestApplication,
    PayloadTooLargeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import type { AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import {
    FILE_STORAGE_PORT,
    type FileStoragePort,
} from '../src/files/file-storage.types';
import { FilesService } from '../src/files/files.service';
import { SupportResourceVersionEntity } from '../src/support-knowledge/entities/support-resource-version.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';
const ZIP = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('synthetic zip payload'),
]);
const PDF = Buffer.from('%PDF-1.7\nsynthetic pdf\n%%EOF');

describe('hosted support file streaming on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let files: FilesService;
    let storage: FileStoragePort;
    let ip = 180;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        auth = app.get(AdminAuthService);
        files = app.get(FilesService);
        storage = app.get(FILE_STORAGE_PORT);
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

    const nextIp = () => `10.180.0.${++ip}`;

    async function staff(login: string, roles: AdminRole[]) {
        const user = await auth.createStaff({
            login,
            displayName: login,
            password: PASSWORD,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login, password: PASSWORD })
            .expect(201);
        return { agent, user };
    }

    function mutate(
        agent: ReturnType<typeof request.agent>,
        method: 'post' | 'patch' | 'put',
        path: string,
    ) {
        return agent[method](path).set('Origin', ORIGIN);
    }

    async function hostedVersion(
        agent: ReturnType<typeof request.agent>,
        slug: string,
        type = 'driver',
    ) {
        const resource = await mutate(
            agent,
            'post',
            '/admin/api/support/resources',
        )
            .send({ slug, title: slug, type })
            .expect(201);
        const version = await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resource.body.id}/versions`,
        )
            .send({
                versionLabel: '1.0',
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'hosted',
            })
            .expect(201);
        return { resource: resource.body, version: version.body };
    }

    function upload(
        agent: ReturnType<typeof request.agent>,
        versionId: number,
        filename: string,
        body = ZIP,
        mime = 'application/zip',
    ) {
        return mutate(
            agent,
            'put',
            `/admin/api/support/resource-versions/${versionId}/file`,
        )
            .set('X-Vitma-Filename', encodeURIComponent(filename))
            .set('Content-Type', mime)
            .send(body);
    }

    it('authenticates and authorizes before invoking the raw upload workflow', async () => {
        const { agent: manager } = await staff('fs-manager', ['sales_manager']);
        const { agent: operator } = await staff('fs-operator', ['operator']);
        const { agent: engineer } = await staff('fs-engineer', ['engineer']);
        const target = await hostedVersion(manager, 'auth-before-stream');
        const external = await mutate(
            manager,
            'post',
            `/admin/api/support/resources/${target.resource.id}/versions`,
        )
            .send({
                platform: 'linux',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'external',
                externalUrl: 'https://downloads.example.test/driver.zip',
            })
            .expect(201);
        const saveSpy = jest.spyOn(files, 'saveSupportStream');

        await request(app.getHttpServer())
            .put(
                `/admin/api/support/resource-versions/${target.version.id}/file`,
            )
            .set('X-Vitma-Filename', 'driver.zip')
            .set('Content-Type', 'application/zip')
            .send(ZIP)
            .expect(401);
        await upload(operator, target.version.id, 'driver.zip').expect(403);
        await upload(engineer, target.version.id, 'driver.zip').expect(403);
        await upload(manager, 999_999, 'driver.zip').expect(404);
        await upload(manager, external.body.id, 'driver.zip').expect(409);
        expect(saveSpy).not.toHaveBeenCalled();
        expect(await dataSource.getRepository(StoredFileEntity).count()).toBe(
            0,
        );
        saveSpy.mockRestore();
    });

    it('streams a trusted hosted file, publishes it, and downloads by resource context', async () => {
        const { agent } = await staff('fs-happy', ['sales_manager']);
        const target = await hostedVersion(agent, 'hosted-driver');
        const filename = 'Драйвер кассы.zip';
        const uploaded = await upload(
            agent,
            target.version.id,
            filename,
        ).expect(200);
        expect(uploaded.body).toMatchObject({
            id: target.version.id,
            distributionMode: 'hosted',
            hasStoredFile: true,
            storedFile: {
                originalName: filename,
                mimeType: 'application/zip',
                status: 'active',
            },
        });
        expect(JSON.stringify(uploaded.body)).not.toContain('objectKey');

        const downloadPath = `/api/support/resources/hosted-driver/versions/${target.version.id}/download`;
        await request(app.getHttpServer()).get(downloadPath).expect(404);

        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${target.version.id}/publish`,
        ).expect(201);
        await request(app.getHttpServer()).get(downloadPath).expect(404);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${target.resource.id}/publish`,
        ).expect(201);

        const detail = await request(app.getHttpServer())
            .get('/api/support/resources/hosted-driver')
            .expect(200);
        expect(detail.body.versions[0]).toMatchObject({
            externalUrl: null,
            hostedFile: {
                filename,
                mimeType: 'application/zip',
                sizeBytes: String(ZIP.length),
                downloadUrl: `/api/support/resources/hosted-driver/versions/${target.version.id}/download`,
            },
        });
        expect(JSON.stringify(detail.body)).not.toContain('objectKey');

        const downloaded = await request(app.getHttpServer())
            .get(downloadPath)
            .set('Range', 'bytes=0-3')
            .buffer(true)
            .parse((response, callback) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => callback(null, Buffer.concat(chunks)));
            })
            .expect(200);
        expect(downloaded.body).toEqual(ZIP);
        expect(downloaded.headers['content-type']).toContain('application/zip');
        expect(downloaded.headers['content-length']).toBe(String(ZIP.length));
        expect(downloaded.headers['x-content-type-options']).toBe('nosniff');
        expect(downloaded.headers['content-disposition']).toContain(
            "filename*=UTF-8''",
        );
        expect(downloaded.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
        expect(downloaded.headers['content-range']).toBeUndefined();
        await request(app.getHttpServer())
            .get(downloadPath)
            .set('If-None-Match', downloaded.headers.etag)
            .expect(304);
        await request(app.getHttpServer())
            .get(
                `/api/support/resources/wrong-slug/versions/${target.version.id}/download`,
            )
            .expect(404);
        await request(app.getHttpServer())
            .get(
                '/api/support/resources/hosted-driver/versions/999999/download',
            )
            .expect(404);

        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${target.version.id}/unpublish`,
        ).expect(201);
        await request(app.getHttpServer()).get(downloadPath).expect(404);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${target.version.id}/publish`,
        ).expect(201);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${target.resource.id}/unpublish`,
        ).expect(201);
        await request(app.getHttpServer()).get(downloadPath).expect(404);

        const event = await dataSource
            .getRepository(AuditEventEntity)
            .findOneByOrFail({ action: 'support.version.file.attach' });
        expect(event.metadata).toMatchObject({
            resourceId: target.resource.id,
            storedFileId: uploaded.body.storedFile.id,
            detectedFileKind: 'zip',
        });
        expect(JSON.stringify(event)).not.toContain(filename);
    });

    it('rejects signature, extension, MIME, resource-type, filename, and size mismatches without final objects', async () => {
        const { agent, user } = await staff('fs-validation', ['sales_manager']);
        const driver = await hostedVersion(agent, 'validation-driver');
        const manual = await hostedVersion(
            agent,
            'validation-manual',
            'manual',
        );

        await upload(
            agent,
            driver.version.id,
            'driver.zip',
            Buffer.from('not an archive'),
        ).expect(400);
        await upload(
            agent,
            driver.version.id,
            'driver.zip',
            Buffer.from('still not an archive'),
            'application/octet-stream',
        ).expect(400);
        await upload(agent, driver.version.id, 'driver.pdf').expect(400);
        await upload(
            agent,
            driver.version.id,
            'driver.zip',
            ZIP,
            'application/pdf',
        ).expect(400);
        await upload(agent, manual.version.id, 'manual.zip').expect(400);
        await mutate(
            agent,
            'put',
            `/admin/api/support/resource-versions/${driver.version.id}/file`,
        )
            .set('X-Vitma-Filename', encodeURIComponent('../driver.zip'))
            .set('Content-Type', 'application/zip')
            .send(ZIP)
            .expect(400);
        await mutate(
            agent,
            'put',
            `/admin/api/support/resource-versions/${driver.version.id}/file`,
        )
            .set('X-Vitma-Filename', 'driver.zip')
            .set('Content-Type', 'application/zip')
            .set('Content-Length', '536870913')
            .send(ZIP)
            .expect(413);

        const maxBytes = jest
            .spyOn(files, 'getSupportMaxBytes')
            .mockReturnValue(16);
        await expect(
            files.saveSupportStream({
                source: Readable.from([ZIP, Buffer.alloc(32, 1)]),
                originalName: 'chunked.zip',
                declaredMime: 'application/octet-stream',
                resourceId: driver.resource.id,
                versionId: driver.version.id,
                resourceType: 'driver',
                createdByStaffId: user.id,
            }),
        ).rejects.toBeInstanceOf(PayloadTooLargeException);
        maxBytes.mockRestore();

        await expect(
            files.saveSupportStream({
                source: Readable.from(
                    (function* () {
                        yield Buffer.concat([ZIP, Buffer.alloc(128 * 1024, 1)]);
                        throw new Error('synthetic interrupted request');
                    })(),
                ),
                originalName: 'interrupted.zip',
                declaredMime: 'application/zip',
                resourceId: driver.resource.id,
                versionId: driver.version.id,
                resourceType: 'driver',
                createdByStaffId: user.id,
            }),
        ).rejects.toThrow('synthetic interrupted request');

        expect(await dataSource.getRepository(StoredFileEntity).count()).toBe(
            0,
        );
        const entries = [];
        for await (const entry of storage.listEntries()) entries.push(entry);
        expect(entries).toEqual([]);

        await upload(
            agent,
            manual.version.id,
            'manual.pdf',
            PDF,
            'application/pdf',
        ).expect(200);
        await upload(
            agent,
            driver.version.id,
            'driver.exe',
            portableExecutable(),
            'application/octet-stream',
        ).expect(200);
    });

    it('allows one concurrent attachment winner and leaves the loser cleanup-eligible', async () => {
        const { agent } = await staff('fs-concurrent', ['sales_manager']);
        const target = await hostedVersion(agent, 'concurrent-driver');
        const responses = await Promise.all([
            upload(agent, target.version.id, 'first.zip'),
            upload(
                agent,
                target.version.id,
                'second.zip',
                Buffer.concat([ZIP, Buffer.from('second')]),
            ),
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([
            200, 409,
        ]);
        const rows = await dataSource.getRepository(StoredFileEntity).find({
            order: { id: 'ASC' },
        });
        expect(rows.map((file) => file.status).sort()).toEqual([
            'active',
            'rejected',
        ]);
        expect(
            rows.find((file) => file.status === 'rejected')?.purgeAfter,
        ).toBeInstanceOf(Date);
        expect(
            await dataSource
                .getRepository(SupportResourceVersionEntity)
                .findOneByOrFail({ id: target.version.id }),
        ).toMatchObject({
            storedFileId: rows.find((file) => file.status === 'active')?.id,
        });
    });

    it('fails closed for tampered bindings and unavailable hosted objects', async () => {
        const { agent, user } = await staff('fs-fail-closed', [
            'sales_manager',
        ]);
        const target = await hostedVersion(agent, 'broken-hosted');
        const unrelatedVersion = await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${target.resource.id}/versions`,
        )
            .send({
                platform: 'linux',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'hosted',
            })
            .expect(201);
        const unrelated = await files.saveBuffer({
            purpose: 'service-attachment',
            buffer: PDF,
            originalName: 'unrelated.pdf',
            mimeType: 'application/pdf',
            createdByStaffId: user.id,
        });
        await dataSource
            .getRepository(SupportResourceVersionEntity)
            .update(unrelatedVersion.body.id, { storedFileId: unrelated.id });
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${unrelatedVersion.body.id}/publish`,
        ).expect(409);
        const uploaded = await upload(
            agent,
            target.version.id,
            'driver.zip',
        ).expect(200);
        const storedFile = await dataSource
            .getRepository(StoredFileEntity)
            .findOneByOrFail({ id: uploaded.body.storedFile.id });
        storedFile.metadata = {
            ...storedFile.metadata,
            supportResourceVersionId: 999_999,
        };
        await dataSource.getRepository(StoredFileEntity).save(storedFile);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${target.version.id}/publish`,
        ).expect(409);

        storedFile.metadata.supportResourceVersionId = target.version.id;
        for (const status of ['missing', 'corrupt', 'deleted'] as const) {
            storedFile.status = status;
            await dataSource.getRepository(StoredFileEntity).save(storedFile);
            await mutate(
                agent,
                'post',
                `/admin/api/support/resource-versions/${target.version.id}/publish`,
            ).expect(409);
        }
        storedFile.status = 'active';
        await dataSource.getRepository(StoredFileEntity).save(storedFile);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${target.version.id}/publish`,
        ).expect(201);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${target.resource.id}/publish`,
        ).expect(201);

        storedFile.metadata.supportResourceVersionId = 999_999;
        await dataSource.getRepository(StoredFileEntity).save(storedFile);
        const publicList = await request(app.getHttpServer())
            .get('/api/support/resources')
            .expect(200);
        expect(publicList.body.items).toEqual([]);
        await request(app.getHttpServer())
            .get('/api/support/resources/broken-hosted')
            .expect(404);
        storedFile.metadata.supportResourceVersionId = target.version.id;
        await dataSource.getRepository(StoredFileEntity).save(storedFile);

        storedFile.status = 'corrupt';
        storedFile.corruptAt = new Date();
        await dataSource.getRepository(StoredFileEntity).save(storedFile);
        await request(app.getHttpServer())
            .get('/api/support/resources/broken-hosted')
            .expect(404);
        await request(app.getHttpServer())
            .get(
                `/api/support/resources/broken-hosted/versions/${target.version.id}/download`,
            )
            .expect(404);

        storedFile.status = 'active';
        storedFile.corruptAt = null;
        await dataSource.getRepository(StoredFileEntity).save(storedFile);
        await storage.remove(storedFile.objectKey);
        storedFile.status = 'missing';
        storedFile.missingAt = new Date();
        await dataSource.getRepository(StoredFileEntity).save(storedFile);

        await request(app.getHttpServer())
            .get('/api/support/resources/broken-hosted')
            .expect(404);
        await request(app.getHttpServer())
            .get(
                `/api/support/resources/broken-hosted/versions/${target.version.id}/download`,
            )
            .expect(404);
    });
});

function portableExecutable() {
    const buffer = Buffer.alloc(256);
    buffer.write('MZ');
    buffer.writeUInt32LE(128, 0x3c);
    buffer.write('PE\0\0', 128, 'binary');
    return buffer;
}
