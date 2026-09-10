/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, createHash } from 'node:crypto';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { WebSessionService } from '../src/web-session/web-session.service';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { ServiceRequestPaymentProofService } from '../src/service-requests/service-request-payment-proof.service';
import { ServiceRequestAdminCommandsService } from '../src/service-requests/service-request-admin-commands.service';
import { ServiceRequestAdminReadService } from '../src/service-requests/service-request-admin-read.service';
import {
    ServiceRequestEntity,
    ServiceRequestStatus,
} from '../src/service-requests/entities/service-request.entity';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';
import { ServiceRequestEventEntity } from '../src/service-requests/entities/service-request-event.entity';
import { ServiceRequestMessageEntity } from '../src/service-requests/entities/service-request-message.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FilesService } from '../src/files/files.service';
import { StoredFileReferenceInspector } from '../src/files/stored-file-reference-inspector';
import {
    FILE_STORAGE_PORT,
    FileStoragePort,
} from '../src/files/file-storage.types';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { CustomerActivityEntity } from '../src/customer-activity/entities/customer-activity.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { OutboundDeliveriesService } from '../src/outbound-deliveries/outbound-deliveries.service';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminPrincipal } from '../src/admin/admin-auth.types';
import { getPermissions } from '../src/admin/admin.permissions';
import { UserEntity } from '../src/users/entities/user.entity';

const origin = 'http://localhost:5174';
const pdf = Buffer.from('%PDF-1.4\nSynthetic payment example\n%%EOF');
const input = {
    buffer: pdf,
    originalName: 'proof.pdf',
    mimeType: 'application/pdf',
};
const formats = [
    ['proof.pdf', 'application/pdf', pdf],
    ['proof.jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224])],
    ['proof.png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['proof.webp', 'image/webp', Buffer.from('RIFF0000WEBPVP8 ')],
] as const;

describe('P-PROOF canonical owner upload', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let files: FilesService;
    let proofs: ServiceRequestPaymentProofService;
    let ip = 1;
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        files = app.get(FilesService);
        proofs = app.get(ServiceRequestPaymentProofService);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });
    beforeEach(async () => {
        const tables: Array<{ tablename: string }> = await db.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'typeorm_migrations'",
        );
        await db.query(
            `TRUNCATE ${tables.map((item) => `"${item.tablename.replaceAll('"', '""')}"`).join(',')} RESTART IDENTITY CASCADE`,
        );
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(async () => {
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        await app?.close();
    });

    async function fixture(
        status: ServiceRequestStatus = 'waiting_payment',
        invoice = true,
    ) {
        const session = await app.get(WebSessionService).create();
        const service = app.get(ServiceRequestsService);
        const draft = await service.createWebDraft(session.principal, {
            serviceTypeCode: 'firmware_update',
            contactSnapshot: {
                name: 'Synthetic client',
                phone: '+79990000000',
                preferredChannel: 'web',
            },
            answers: {},
        });
        const invoiceFile = invoice
            ? await files.saveBuffer({
                  purpose: 'service-invoice',
                  buffer: pdf,
                  originalName: 'invoice.pdf',
                  mimeType: 'application/pdf',
              })
            : null;
        const token = randomBytes(32).toString('base64url');
        await db.getRepository(ServiceRequestEntity).update(draft.id, {
            status,
            invoiceStoredFileId: invoiceFile?.id ?? null,
            publicTokenHash: createHash('sha256').update(token).digest('hex'),
        });
        const row = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: draft.id });
        const agent = request.agent(app.getHttpServer());
        agent.set('Cookie', `vitma_web_session=${session.token}`);
        agent.set('X-Forwarded-For', `10.95.0.${++ip}`);
        return {
            session: session.principal,
            row,
            agent,
            token,
            path: `/api/client/service-requests/${row.id}/payment-proof`,
        };
    }
    async function operator() {
        const staff = await app.get(AdminAuthService).createStaff({
            login: `proof${++ip}`,
            displayName: 'Synthetic operator',
            password: randomBytes(24).toString('base64url'),
            roles: ['operator'],
        });
        await db.getRepository(AdminUserEntity).update(staff.id, {
            notifyServiceRequests: true,
            telegramChatId: '990000009999',
        });
        return {
            ...staff,
            roles: ['operator'],
            permissions: getPermissions(['operator']),
            sessionId: null,
        } as unknown as AdminPrincipal;
    }
    function upload(
        f: Awaited<ReturnType<typeof fixture>>,
        version = f.row.version,
    ) {
        return f.agent
            .post(f.path)
            .set('Origin', origin)
            .field('expectedVersion', String(version));
    }
    const target = (row: ServiceRequestEntity) => ({
        requestId: row.id,
        expectedVersion: row.version,
    });
    const currentRow = (id: number) =>
        db.getRepository(ServiceRequestEntity).findOneByOrFail({ id });
    async function counts(id: number) {
        return {
            attachments: await db
                .getRepository(ServiceRequestAttachmentEntity)
                .countBy({ serviceRequestId: id, kind: 'payment_proof' }),
            events: await db.getRepository(ServiceRequestEventEntity).countBy({
                serviceRequestId: id,
                type: 'payment_proof_attached',
            }),
            audits: await db.getRepository(AuditEventEntity).countBy({
                action: 'service_request.payment_proof.upload',
                targetId: String(id),
            }),
            activity: await db.getRepository(CustomerActivityEntity).countBy({
                serviceRequestId: id,
                type: 'service_request_payment_proof_attached',
            }),
            outbox: await db.getRepository(OutboundDeliveryEntity).countBy({
                sourceType: 'service_request',
                sourceId: String(id),
                audience: 'staff',
            }),
            messages: await db
                .getRepository(ServiceRequestMessageEntity)
                .countBy({ serviceRequestId: id }),
        };
    }
    async function assertCurrent(
        f: Awaited<ReturnType<typeof fixture>>,
        source = 'web',
        version = f.row.version + 1,
    ) {
        const row = await currentRow(f.row.id);
        expect(row).toMatchObject({ status: 'waiting_payment', version });
        const attachments = await db
            .getRepository(ServiceRequestAttachmentEntity)
            .findBy({ serviceRequestId: row.id, kind: 'payment_proof' });
        expect(attachments).toHaveLength(1);
        const attachment = attachments[0];
        expect(attachment).toMatchObject({
            storedFileId: row.paymentProofFileId,
            customerVisible: true,
            uploadedByCustomerId: row.userId,
            uploadedByStaffId: null,
        });
        const file = await db
            .getRepository(StoredFileEntity)
            .findOneByOrFail({ id: row.paymentProofFileId! });
        expect(file).toMatchObject({
            status: 'active',
            createdByCustomerId: row.userId,
            createdByStaffId: null,
            purgedAt: null,
            metadata: {
                purpose: 'payment-proof',
                source,
                serviceRequestId: row.id,
                serviceRequestAttachmentId: attachment.id,
                attachmentKind: 'payment_proof',
                canonical: true,
            },
        });
        expect(await files.exists(file)).toBe(true);
        expect(file.objectKey).not.toContain('proof.pdf');
        return { row, attachment, file };
    }

    it('commits the canonical proof, event, audit, activity and notification; requires manual payment confirmation', async () => {
        const f = await fixture();
        const admin = await operator();
        const read = app.get(ServiceRequestAdminReadService);
        expect(
            (await read.detail(admin, f.row.id)).workflow.actions.find(
                (item) => item.id === 'confirm_payment',
            ),
        ).toMatchObject({
            allowed: false,
            reasonCode: 'PAYMENT_PROOF_REQUIRED',
        });
        const pending = jest.spyOn(files, 'savePendingBuffer');
        const response = await upload(f)
            .attach('file', pdf, {
                filename: 'Платёж.pdf',
                contentType: 'application/pdf',
            })
            .expect(201);
        expect(pending).toHaveBeenCalledTimes(1);
        const { row, attachment, file } = await assertCurrent(f);
        expect(response.body).toMatchObject({
            request: { id: row.id, status: 'waiting_payment' },
            customerWorkflow: {
                expectedVersion: row.version,
                paymentProof: { allowed: true, replacement: true },
            },
            documents: {
                paymentProof: {
                    attachmentId: attachment.id,
                    originalName: 'Платёж.pdf',
                    downloadable: true,
                    downloadUrl: f.path,
                },
            },
        });
        expect(await counts(row.id)).toEqual({
            attachments: 1,
            events: 1,
            audits: 1,
            activity: 1,
            outbox: 1,
            messages: 0,
        });
        const event = await db
            .getRepository(ServiceRequestEventEntity)
            .findOneByOrFail({
                serviceRequestId: row.id,
                type: 'payment_proof_attached',
            });
        expect(event).toMatchObject({
            actor: 'customer',
            payload: {
                attachmentId: attachment.id,
                replaced: false,
                source: 'web',
            },
        });
        const audit = await db.getRepository(AuditEventEntity).findOneByOrFail({
            action: 'service_request.payment_proof.upload',
        });
        expect(audit).toMatchObject({
            actorType: 'customer',
            actorCustomerId: f.session.userId,
            actorWebSessionId: f.session.sessionId,
            metadata: event.payload,
        });
        const notification = await db
            .getRepository(OutboundDeliveryEntity)
            .findOneByOrFail({ audience: 'staff' });
        expect(notification).toMatchObject({
            status: 'pending',
            storedFileId: null,
            dedupeKey: `service-request:${row.id}:payment-proof:${attachment.id}:staff:staff:${admin.id}:telegram`,
        });
        const safe = JSON.stringify([
            event.payload,
            audit.metadata,
            notification.payload,
            file.metadata,
        ]);
        for (const value of [
            'Платёж',
            '%PDF',
            'objectKey',
            'http',
            'token',
            f.token,
        ])
            expect(safe).not.toContain(value);
        const detail = await f.agent
            .get(`/api/client/service-requests/${row.id}`)
            .expect(200);
        expect(detail.body.documents).toMatchObject(response.body.documents);
        expect(detail.body.attachments).toEqual([]);
        const refreshed = await read.detail(admin, row.id);
        expect(
            refreshed.workflow.actions.find(
                (item) => item.id === 'confirm_payment',
            ),
        ).toMatchObject({ allowed: true, expectedVersion: row.version });
        await app
            .get(ServiceRequestAdminCommandsService)
            .transition(admin, row.id, 'paid', row.version);
        expect((await currentRow(row.id)).status).toBe('paid');
    });
    it.each(formats)(
        'accepts strict %s and streams the current bytes with private headers',
        async (filename, contentType, buffer) => {
            const f = await fixture();
            await upload(f)
                .attach('file', buffer, { filename, contentType })
                .expect(201);
            const response = await f.agent.get(f.path).expect(200);
            expect(response.body).toEqual(buffer);
            expect(response.headers).toMatchObject({
                'content-type': contentType,
                'content-length': String(buffer.length),
                'cache-control': 'private, no-store',
                'x-content-type-options': 'nosniff',
            });
            expect(response.headers['content-disposition']).toContain(
                'attachment; filename=',
            );
            expect(response.headers['content-disposition']).toContain(
                "filename*=UTF-8''",
            );
        },
    );
    it('replaces exactly one pointer and attachment, logically retires old bytes after commit, and conflicts on stale retry', async () => {
        const f = await fixture();
        await operator();
        await upload(f).attach('file', pdf, 'proof.pdf').expect(201);
        const first = await assertCurrent(f);
        jest.spyOn(files, 'logicalDelete').mockImplementation(async (id) => {
            expect((await currentRow(f.row.id)).paymentProofFileId).not.toBe(
                id,
            );
            expect(
                await db
                    .getRepository(ServiceRequestAttachmentEntity)
                    .countBy({ storedFileId: id }),
            ).toBe(0);
            return originalDelete(id);
        });
        const originalDelete: FilesService['logicalDelete'] =
            FilesService.prototype.logicalDelete.bind(files);
        await upload(f, first.row.version)
            .attach('file', pdf, 'replacement.pdf')
            .expect(201);
        const second = await assertCurrent(f, 'web', first.row.version + 1);
        expect(second.file.id).not.toBe(first.file.id);
        expect(
            await db
                .getRepository(StoredFileEntity)
                .findOneByOrFail({ id: first.file.id }),
        ).toMatchObject({ status: 'deleted', purgedAt: null });
        expect(await files.exists(first.file)).toBe(true);
        await upload(f, first.row.version)
            .attach('file', pdf, 'retry.pdf')
            .expect(409);
        expect((await currentRow(f.row.id)).paymentProofFileId).toBe(
            second.file.id,
        );
        expect(await counts(f.row.id)).toEqual({
            attachments: 1,
            events: 2,
            audits: 2,
            activity: 2,
            outbox: 2,
            messages: 0,
        });
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'rejected' }),
        ).toBe(1);
    });
    it('keeps public bearer and generic attachment routes outside the proof boundary', async () => {
        const f = await fixture();
        await upload(f).attach('file', pdf, 'private-proof.pdf').expect(201);
        const { attachment, file } = await assertCurrent(f);
        const staffFile = await app
            .get(ServiceRequestsService)
            .openAdminAttachment(f.row.id, attachment.id);
        expect(staffFile.file.id).toBe(file.id);
        staffFile.stream.destroy();
        const path = `/api/public/service-requests/${f.token}`;
        const publicView = await request(app.getHttpServer())
            .get(path)
            .expect(200);
        for (const key of [
            'documents',
            'customerWorkflow',
            'expectedVersion',
            'paymentProofFileId',
            'objectKey',
            'metadata',
            'private-proof.pdf',
        ])
            expect(JSON.stringify(publicView.body)).not.toContain(key);
        expect(publicView.body.attachments).toEqual([]);
        await request(app.getHttpServer())
            .get(`${path}/attachments/${attachment.id}`)
            .expect(404);
        await f.agent
            .get(
                `/api/client/service-requests/${f.row.id}/attachments/${attachment.id}`,
            )
            .expect(404);
        await request(app.getHttpServer())
            .get(`${path}/payment-proof`)
            .expect(404);
        await request(app.getHttpServer())
            .post(`${path}/payment-proof`)
            .expect(404);
        await request(app.getHttpServer())
            .get(`/api/client/files/${file.id}`)
            .expect(404);
        const foreign = await fixture();
        await foreign.agent.get(f.path).expect(404);
        await request(app.getHttpServer()).get(f.path).expect(401);
    });
    it('leaves generic message attachments noncanonical and payment blocked', async () => {
        const f = await fixture();
        const admin = await operator();
        await f.agent
            .post(
                `/api/client/service-requests/${f.row.id}/messages/attachments`,
            )
            .set('Origin', origin)
            .attach('file', pdf, 'ordinary.pdf')
            .expect(201);
        expect((await currentRow(f.row.id)).paymentProofFileId).toBeNull();
        const attachment = await db
            .getRepository(ServiceRequestAttachmentEntity)
            .findOneByOrFail({ serviceRequestId: f.row.id });
        expect(attachment.kind).toBe('message');
        expect(
            (
                await db
                    .getRepository(StoredFileEntity)
                    .findOneByOrFail({ id: attachment.storedFileId })
            ).metadata?.purpose,
        ).toBe('service-attachment');
        expect(
            await db
                .getRepository(ServiceRequestMessageEntity)
                .countBy({ serviceRequestId: f.row.id }),
        ).toBe(1);
        expect(
            (
                await app
                    .get(ServiceRequestAdminReadService)
                    .detail(admin, f.row.id)
            ).workflow.actions.find((item) => item.id === 'confirm_payment')
                ?.allowed,
        ).toBe(false);
        await f.agent.get(f.path).expect(404);
    });
    it.each([
        'draft',
        'submitted',
        'invoice_required',
        'paid',
        'completed',
        'closed',
        'cancelled',
    ] as const)('rejects %s before the multipart parser', async (status) => {
        const f = await fixture(status);
        const save = jest.spyOn(files, 'savePendingBuffer');
        await f.agent
            .post(f.path)
            .set('Origin', origin)
            .set('Content-Type', 'multipart/form-data; boundary=broken')
            .send('malformed multipart')
            .expect(409);
        expect(save).not.toHaveBeenCalled();
        expect((await currentRow(f.row.id)).version).toBe(f.row.version);
    });
    it('rejects missing invoice and owner/origin/session/path failures before malformed multipart', async () => {
        const f = await fixture('waiting_payment', false);
        await f.agent
            .post(f.path)
            .set('Origin', origin)
            .set('Content-Type', 'multipart/form-data; boundary=x')
            .send('broken')
            .expect(409);
        const ready = await fixture();
        const save = jest.spyOn(files, 'savePendingBuffer');
        for (const source of ['', 'https://foreign.example.test']) {
            await ready.agent
                .post(ready.path)
                .set('Origin', source)
                .set('Content-Type', 'multipart/form-data; boundary=x')
                .send('broken')
                .expect(403);
        }
        await request(app.getHttpServer())
            .post(ready.path)
            .set('Origin', origin)
            .set('Content-Type', 'multipart/form-data; boundary=x')
            .send('broken')
            .expect(401);
        await f.agent
            .post(ready.path)
            .set('Origin', origin)
            .set('Content-Type', 'multipart/form-data; boundary=x')
            .send('broken')
            .expect(404);
        for (const id of [
            '0',
            '-1',
            '2147483648',
            '9999999999999999999999999',
        ]) {
            await ready.agent
                .post(`/api/client/service-requests/${id}/payment-proof`)
                .set('Origin', origin)
                .set('Content-Type', 'multipart/form-data; boundary=x')
                .send('broken')
                .expect(404);
        }
        expect(save).not.toHaveBeenCalled();
    });
    it.each(['', '0', '-1', '1.5', 'abc', '2147483648'])(
        'rejects invalid expectedVersion %s without storage',
        async (version) => {
            const f = await fixture();
            const save = jest.spyOn(files, 'savePendingBuffer');
            await f.agent
                .post(f.path)
                .set('Origin', origin)
                .field('expectedVersion', version)
                .attach('file', pdf, 'proof.pdf')
                .expect(400);
            expect(save).not.toHaveBeenCalled();
        },
    );
    it('enforces exactly one version field and file plus hardened field/body limits', async () => {
        const f = await fixture();
        const save = jest.spyOn(files, 'savePendingBuffer');
        await f.agent
            .post(f.path)
            .set('Origin', origin)
            .attach('file', pdf, 'proof.pdf')
            .expect(400);
        await upload(f).expect(400);
        await upload(f)
            .field('extra', 'x')
            .attach('file', pdf, 'proof.pdf')
            .expect(400);
        await upload(f)
            .field('expectedVersion', '2')
            .attach('file', pdf, 'proof.pdf')
            .expect(400);
        await upload(f)
            .attach('file', pdf, 'proof.pdf')
            .attach('file', pdf, 'second.pdf')
            .expect(400);
        await f.agent
            .post(f.path)
            .set('Origin', origin)
            .field('expectedVersion[nested]', '1')
            .attach('file', pdf, 'proof.pdf')
            .expect(400);
        await f.agent
            .post(f.path)
            .set('Origin', origin)
            .field('expectedVersion', 'x'.repeat(65537))
            .attach('file', pdf, 'proof.pdf')
            .expect(400);
        await upload(f)
            .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), 'proof.pdf')
            .expect(413);
        expect(save).not.toHaveBeenCalled();
    });
    it.each([
        ['proof.pdf', 'application/pdf', Buffer.from('not a PDF')],
        ['proof.pdf', 'application/pdf', Buffer.alloc(0)],
        ['proof.pdf', 'image/png', pdf],
        ['proof.png', 'application/pdf', pdf],
        ['proof.exe', 'application/octet-stream', pdf],
        ['proof.pdf', 'application/pdf', Buffer.from('<html>malicious</html>')],
    ])(
        'rejects invalid bytes/MIME/name %s %s',
        async (filename, contentType, buffer) => {
            const f = await fixture();
            const save = jest.spyOn(files, 'savePendingBuffer');
            await upload(f)
                .attach('file', buffer, { filename, contentType })
                .expect(400);
            expect(save).not.toHaveBeenCalled();
            expect(await counts(f.row.id)).toEqual({
                attachments: 0,
                events: 0,
                audits: 0,
                activity: 0,
                outbox: 0,
                messages: 0,
            });
        },
    );
    it.each(['missing', 'deleted', 'rejected', 'pending', 'corrupt'] as const)(
        'does not download current file with status %s',
        async (status) => {
            const f = await fixture();
            await upload(f).attach('file', pdf, 'proof.pdf').expect(201);
            const { file } = await assertCurrent(f);
            await db
                .getRepository(StoredFileEntity)
                .update(file.id, { status });
            await f.agent.get(f.path).expect(404);
            const detail = await f.agent
                .get(`/api/client/service-requests/${f.row.id}`)
                .expect(200);
            expect(detail.body.documents.paymentProof).toMatchObject({
                downloadable: false,
                downloadUrl: null,
            });
        },
    );
    it.each(['purged', 'physical', 'binding', 'provenance'] as const)(
        'fails closed for unavailable %s proof',
        async (reason) => {
            const f = await fixture();
            await upload(f).attach('file', pdf, 'proof.pdf').expect(201);
            const { file, attachment } = await assertCurrent(f);
            if (reason === 'purged')
                await db
                    .getRepository(StoredFileEntity)
                    .update(file.id, { purgedAt: new Date() });
            if (reason === 'physical')
                await app
                    .get<FileStoragePort>(FILE_STORAGE_PORT)
                    .remove(file.objectKey);
            if (reason === 'binding')
                await db.getRepository(StoredFileEntity).update(file.id, {
                    metadata: { ...file.metadata, serviceRequestId: 999 },
                });
            if (reason === 'provenance')
                await db
                    .getRepository(ServiceRequestAttachmentEntity)
                    .update(attachment.id, { uploadedByCustomerId: 999 });
            await f.agent.get(f.path).expect(404);
            expect(
                (await proofs.ownerView(f.session, f.row.id)).documents
                    .paymentProof?.downloadable,
            ).toBe(false);
        },
    );

    it.each(['audit', 'outbox', 'pending-binding', 'physical'] as const)(
        'rolls back canonical changes on %s failure and rejects pending file',
        async (failure) => {
            const f = await fixture();
            await operator();
            await upload(f).attach('file', pdf, 'proof.pdf').expect(201);
            const first = await assertCurrent(f);
            if (failure === 'audit')
                jest.spyOn(
                    app.get(AuditService),
                    'record',
                ).mockRejectedValueOnce(new Error('Synthetic audit failure'));
            if (failure === 'outbox')
                jest.spyOn(
                    app.get(OutboundDeliveriesService),
                    'enqueue',
                ).mockRejectedValueOnce(new Error('Synthetic enqueue failure'));
            if (failure === 'physical')
                jest.spyOn(files, 'exists').mockResolvedValueOnce(false);
            if (failure === 'pending-binding') {
                const original: FilesService['savePendingBuffer'] =
                    files.savePendingBuffer.bind(files);
                jest.spyOn(files, 'savePendingBuffer').mockImplementationOnce(
                    async (value) => {
                        const saved = await original(value);
                        await db
                            .getRepository(StoredFileEntity)
                            .update(saved.id, {
                                metadata: {
                                    ...saved.metadata,
                                    serviceRequestId: 999,
                                },
                            });
                        return saved;
                    },
                );
            }
            await expect(
                proofs.attachForWeb(
                    f.session,
                    f.row.id,
                    first.row.version,
                    input,
                ),
            ).rejects.toThrow();
            expect((await currentRow(f.row.id)).paymentProofFileId).toBe(
                first.file.id,
            );
            expect((await currentRow(f.row.id)).version).toBe(
                first.row.version,
            );
            expect(await counts(f.row.id)).toEqual({
                attachments: 1,
                events: 1,
                audits: 1,
                activity: 1,
                outbox: 1,
                messages: 0,
            });
            expect(
                await db
                    .getRepository(StoredFileEntity)
                    .countBy({ status: 'rejected' }),
            ).toBe(1);
            expect(await files.exists(first.file)).toBe(true);
        },
    );
    it('does not report failure after a committed replacement if retirement fails', async () => {
        const f = await fixture();
        await upload(f).attach('file', pdf, 'proof.pdf').expect(201);
        const first = await currentRow(f.row.id);
        jest.spyOn(files, 'logicalDelete').mockRejectedValueOnce(
            new Error('Synthetic cleanup failure'),
        );
        await expect(
            proofs.attachForWeb(f.session, f.row.id, first.version, input),
        ).resolves.toMatchObject({ request: { status: 'waiting_payment' } });
        await assertCurrent(f, 'web', first.version + 1);
    });

    it('rolls back after a PostgreSQL Audit constraint failure', async () => {
        const f = await fixture();
        await operator();
        await db.query(
            "ALTER TABLE audit_events ADD CONSTRAINT p_proof_test_audit_reject CHECK (action <> 'service_request.payment_proof.upload') NOT VALID",
        );
        try {
            await expect(
                proofs.attachForWeb(f.session, f.row.id, f.row.version, input),
            ).rejects.toMatchObject({ driverError: { code: '23514' } });
            expect((await currentRow(f.row.id)).paymentProofFileId).toBeNull();
            expect((await currentRow(f.row.id)).version).toBe(f.row.version);
            expect(await counts(f.row.id)).toEqual({
                attachments: 0,
                events: 0,
                audits: 0,
                activity: 0,
                outbox: 0,
                messages: 0,
            });
            expect(
                await db
                    .getRepository(StoredFileEntity)
                    .countBy({ status: 'rejected' }),
            ).toBe(1);
        } finally {
            await db.query(
                'ALTER TABLE audit_events DROP CONSTRAINT p_proof_test_audit_reject',
            );
        }
    });
    it('does not mask an original conflict when rejection cleanup fails', async () => {
        const f = await fixture();
        await db
            .getRepository(ServiceRequestEntity)
            .update(f.row.id, { priority: 'high' });
        jest.spyOn(files, 'rejectPendingById').mockRejectedValueOnce(
            new Error('Synthetic rejection cleanup failure'),
        );
        await expect(
            proofs.attachForWeb(f.session, f.row.id, f.row.version, input),
        ).rejects.toBeInstanceOf(ConflictException);
        expect((await currentRow(f.row.id)).paymentProofFileId).toBeNull();
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'pending' }),
        ).toBe(1);
    });
    it('blocks legacy proof bearer access without making incomplete provenance trusted', async () => {
        const f = await fixture();
        const file = await files.saveBuffer({
            purpose: 'payment-proof',
            ...input,
            metadata: { serviceRequestId: f.row.id },
        });
        const attachment = await db
            .getRepository(ServiceRequestAttachmentEntity)
            .save({
                serviceRequestId: f.row.id,
                storedFileId: file.id,
                kind: 'payment_proof',
                customerVisible: true,
            });
        await db
            .getRepository(ServiceRequestEntity)
            .update(f.row.id, { paymentProofFileId: file.id });
        const response = await request(app.getHttpServer())
            .get(`/api/public/service-requests/${f.token}`)
            .expect(200);
        expect(response.body.attachments).toEqual([]);
        await request(app.getHttpServer())
            .get(
                `/api/public/service-requests/${f.token}/attachments/${attachment.id}`,
            )
            .expect(404);
        await f.agent.get(f.path).expect(404);
        expect(
            (await proofs.ownerView(f.session, f.row.id)).documents
                .paymentProof,
        ).toMatchObject({ downloadable: false, originalName: null });
    });

    async function awaitBlocked(count: number) {
        for (let attempt = 0; attempt < 1500; attempt++) {
            const rows: Array<{ count: string }> = await db.query(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT%ServiceRequestEntity%'",
            );
            if (Number(rows[0].count) >= count) return;
        }
        throw new Error('Commands did not reach PostgreSQL row lock barrier');
    }
    async function race(
        row: ServiceRequestEntity,
        first: () => Promise<unknown>,
        second: () => Promise<unknown>,
    ) {
        const runner = db.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        await runner.manager.getRepository(ServiceRequestEntity).findOne({
            where: { id: row.id },
            lock: { mode: 'pessimistic_write' },
        });
        const outcomes: Promise<PromiseSettledResult<unknown>>[] = [];
        const settle = (work: Promise<unknown>) =>
            work.then(
                (value) => ({ status: 'fulfilled', value }) as const,
                (reason) => ({ status: 'rejected', reason }) as const,
            );
        try {
            outcomes.push(settle(first()));
            await awaitBlocked(1);
            outcomes.push(settle(second()));
            await awaitBlocked(2);
            await runner.commitTransaction();
            return await Promise.all(outcomes);
        } finally {
            if (runner.isTransactionActive) await runner.rollbackTransaction();
            await runner.release();
            await Promise.all(outcomes);
        }
    }
    it.each(['web/web', 'web/telegram', 'telegram/max'] as const)(
        'serializes %s uploads with one winner and one rejected pending file',
        async (scenario) => {
            const f = await fixture();
            await operator();
            const user = await db
                .getRepository(UserEntity)
                .save({ chatId: '990000000111', platform: 'telegram' });
            const max = await db
                .getRepository(UserEntity)
                .save({ chatId: '990000000222', platform: 'max' });
            // Synthetic pre-existing exact channel binding; no profile merge or identity API is introduced.
            await db.getRepository(ServiceRequestEntity).update(f.row.id, {
                platform: scenario === 'telegram/max' ? 'max' : 'telegram',
                chatId: scenario === 'telegram/max' ? max.chatId : user.chatId,
                ...(scenario === 'telegram/max' ? { userId: user.id } : {}),
            });
            const row = await currentRow(f.row.id);
            const web = () =>
                proofs.attachForWeb(f.session, row.id, row.version, input);
            const telegram = () =>
                proofs.attachForChannel(
                    { platform: 'telegram', chatId: user.chatId },
                    target(row),
                    input,
                );
            const maxUpload = () =>
                proofs.attachForChannel(
                    { platform: 'max', chatId: max.chatId },
                    target(row),
                    input,
                );
            const results = await race(
                row,
                scenario === 'telegram/max' ? telegram : web,
                scenario === 'web/web'
                    ? web
                    : scenario === 'web/telegram'
                      ? telegram
                      : maxUpload,
            );
            expect(results[0].status).toBe('fulfilled');
            expect(results[1]).toMatchObject({
                status: 'rejected',
                reason: expect.any(ConflictException),
            });
            expect(await counts(row.id)).toEqual({
                attachments: 1,
                events: 1,
                audits: 1,
                activity: 1,
                outbox: 1,
                messages: 0,
            });
            expect(
                await db
                    .getRepository(StoredFileEntity)
                    .countBy({ status: 'rejected' }),
            ).toBe(1);
            await assertCurrent(
                { ...f, row },
                scenario === 'telegram/max' ? 'telegram' : 'web',
            );
        },
    );
    it.each(['upload', 'admin'] as const)(
        'serializes replacement vs manual confirmation with %s winning',
        async (winner) => {
            const f = await fixture();
            const admin = await operator();
            await proofs.attachForWeb(
                f.session,
                f.row.id,
                f.row.version,
                input,
            );
            const first = await assertCurrent(f);
            const replace = () =>
                proofs.attachForWeb(
                    f.session,
                    f.row.id,
                    first.row.version,
                    input,
                );
            const confirm = () =>
                app
                    .get(ServiceRequestAdminCommandsService)
                    .transition(admin, f.row.id, 'paid', first.row.version);
            const result = await race(
                first.row,
                winner === 'upload' ? replace : confirm,
                winner === 'upload' ? confirm : replace,
            );
            expect(result[0].status).toBe('fulfilled');
            expect(result[1]).toMatchObject({
                status: 'rejected',
                reason: expect.any(ConflictException),
            });
            const row = await currentRow(f.row.id);
            expect(row.version).toBe(first.row.version + 1);
            expect(row.status).toBe(
                winner === 'admin' ? 'paid' : 'waiting_payment',
            );
            expect(await counts(row.id)).toEqual({
                attachments: 1,
                events: winner === 'upload' ? 2 : 1,
                audits: winner === 'upload' ? 2 : 1,
                activity: winner === 'upload' ? 2 : 1,
                outbox: winner === 'upload' ? 2 : 1,
                messages: 0,
            });
            if (winner === 'admin') {
                expect(row.paymentProofFileId).toBe(first.file.id);
                expect(
                    await db
                        .getRepository(StoredFileEntity)
                        .countBy({ status: 'rejected' }),
                ).toBe(1);
            }
        },
    );
    it('checks exact channel owner and target before storage; never redirects to another waiting request', async () => {
        const f = await fixture();
        const user = await db
            .getRepository(UserEntity)
            .save({ platform: 'max', chatId: '990000000001' });
        const save = jest.spyOn(files, 'savePendingBuffer');
        await expect(
            proofs.attachForChannel(
                { platform: 'max', chatId: user.chatId },
                target(f.row),
                input,
            ),
        ).rejects.toMatchObject({ status: 404 });
        expect(save).not.toHaveBeenCalled();
        await db
            .getRepository(ServiceRequestEntity)
            .update(f.row.id, { platform: 'max', chatId: user.chatId });
        const row = await currentRow(f.row.id);
        await proofs.attachForChannel(
            { platform: 'max', chatId: user.chatId },
            target(row),
            { buffer: formats[3][2] },
        );
        const file = await db.getRepository(StoredFileEntity).findOneByOrFail({
            id: (await currentRow(row.id)).paymentProofFileId!,
        });
        expect(file.originalName).toBe(`payment_${row.id}.webp`);
        expect(file.metadata?.source).toBe('max');
    });
    it('retains current proofs through existing FK owners; replacement releases the old reference', async () => {
        const f = await fixture();
        await proofs.attachForWeb(f.session, f.row.id, f.row.version, input);
        const first = await assertCurrent(f);
        const inspector = app.get(StoredFileReferenceInspector);
        expect(
            (await inspector.findReferences(first.file.id))
                .map((ref) => `${ref.tableName}.${ref.columnName}`)
                .sort(),
        ).toEqual([
            'service_request_attachments.storedFileId',
            'service_requests.paymentProofFileId',
        ]);
        await expect(
            db.getRepository(StoredFileEntity).delete(first.file.id),
        ).rejects.toMatchObject({ driverError: { code: '23503' } });
        await proofs.attachForWeb(
            f.session,
            f.row.id,
            first.row.version,
            input,
        );
        // No Event, Audit, Activity or outbox payload carries a relational file reference.
        expect(await inspector.findReferences(first.file.id)).toEqual([]);
        await expect(
            db.getRepository(StoredFileEntity).delete(first.file.id),
        ).resolves.toMatchObject({ affected: 1 });
        expect(
            await db
                .getRepository(ServiceRequestAttachmentEntity)
                .countBy({ serviceRequestId: f.row.id, kind: 'payment_proof' }),
        ).toBe(1);
    });
});
