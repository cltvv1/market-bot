import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import PDFDocument from 'pdfkit';
import type { Readable } from 'node:stream';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../../src/admin/admin-auth.service';
import type { AdminRole } from '../../src/admin/entities/admin-user-role.entity';
import { CatalogCategoryEntity } from '../../src/catalog/entities/catalog-category.entity';
import { CatalogProductEntity } from '../../src/catalog/entities/catalog-product.entity';
import type { OrderDetail } from '../../admin-ui/src/features/orders/types';
import { createTestPassword } from '../test-password';

export async function orderWorkspaceFixture(app: INestApplication<App>) {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.match(process.env.TEST_DB_NAME || '', /_test|test_|_ci_/);
    assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
    assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
    assert.equal((process.env.MAX_BOT_TOKEN || '').trim(), '');
    const db = app.get(DataSource);
    const auth = app.get(AdminAuthService);
    const suffix = randomBytes(6).toString('hex');
    const password = createTestPassword();
    async function staff(role: AdminRole, name: string) {
        const user = await auth.createStaff({
            login: `ord-${name}-${suffix}`,
            displayName: `Демо ${name}`,
            password,
            roles: [role],
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set(
                'X-Forwarded-For',
                `10.124.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`,
            )
            .send({ login: user.login, password })
            .expect(201);
        return { user, agent };
    }
    const sales = await staff('sales_manager', 'manager');
    const admin = await staff('superadmin', 'admin');
    const operator = await staff('operator', 'operator');
    const engineer = await staff('engineer', 'engineer');
    const second = await staff('sales_manager', 'second');
    const category = await db.getRepository(CatalogCategoryEntity).save({
        name: 'Демонстрационная техника',
        slug: `ord-demo-${suffix}`,
        isPublished: true,
    });
    const product = await db.getRepository(CatalogProductEntity).save({
        categoryId: category.id,
        name: 'Демо-касса 01',
        sku: `ORD-DEMO-${suffix}`,
        slug: `ord-demo-${suffix}`,
        displayPriceMinor: 3100000,
        vatRate: 2000,
        availabilityStatus: 'in_stock',
        isActive: true,
        isPublished: true,
        features: [],
        specifications: {},
        packageContents: [],
    });
    const client = request.agent(app.getHttpServer());
    await client.post('/api/client/session').send({}).expect(201);
    const origin = 'http://localhost:5173';
    async function create(name = 'Демонстрационная мастерская «Контур»') {
        const response = await client
            .post('/api/client/orders')
            .set('Origin', origin)
            .set('Idempotency-Key', randomUUID())
            .set(
                'X-Forwarded-For',
                `10.125.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`,
            )
            .send({
                customerType: 'individual',
                contact: {
                    name,
                    phone: '+7 000 000-00-00',
                    email: 'demo@example.test',
                },
                delivery: { type: 'pickup' },
                items: [{ productId: product.id, quantity: 1 }],
            })
            .expect(201);
        return response.body as OrderDetail;
    }
    const chunks: Buffer[] = [];
    const Pdf = PDFDocument as unknown as new () => Readable & {
        text(value: string): void;
        end(): void;
    };
    const doc = new Pdf();
    const pdf = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    doc.text('SYNTHETIC ORDER INVOICE. NOT A REAL DOCUMENT.');
    doc.end();
    const buffer = await pdf;
    const command = (
        agent: ReturnType<typeof request.agent>,
        id: number,
        route: string,
        version: number,
        fields: Record<string, unknown> = {},
    ) =>
        agent
            .post(`/admin/api/orders/${id}/${route}`)
            .set('Origin', origin)
            .send({ ...fields, expectedVersion: version });
    const quote = (id: number, version: number, price = '3100000') =>
        sales.agent
            .put(`/admin/api/orders/${id}/quote`)
            .set('Origin', origin)
            .send({
                expectedVersion: version,
                lines: [
                    {
                        productId: product.id,
                        quantity: 1,
                        quotedUnitPriceMinor: price,
                    },
                ],
            });
    const invoice = (
        id: number,
        version: number,
        content = buffer,
        filename = 'demonstration.pdf',
    ) =>
        sales.agent
            .post(`/admin/api/orders/${id}/invoices`)
            .set('Origin', origin)
            .field('expectedVersion', version)
            .attach('file', content, {
                filename,
                contentType: 'application/pdf',
            });
    async function prepare(
        status:
            | 'submitted'
            | 'in_review'
            | 'confirmed'
            | 'waiting_payment'
            | 'paid'
            | 'fulfilled'
            | 'completed' = 'submitted',
    ) {
        let row = await create();
        if (status === 'submitted') return row;
        row = (
            await command(
                sales.agent,
                row.id,
                'start-review',
                row.version,
            ).expect(201)
        ).body as OrderDetail;
        if (status === 'in_review') return row;
        row = (
            await command(sales.agent, row.id, 'confirm', row.version).expect(
                201,
            )
        ).body as OrderDetail;
        if (status === 'confirmed') return row;
        row = (await invoice(row.id, row.version).expect(201))
            .body as OrderDetail;
        if (status === 'waiting_payment') return row;
        row = (
            await command(sales.agent, row.id, 'confirm-payment', row.version, {
                source: 'bank_statement',
            }).expect(201)
        ).body as OrderDetail;
        if (status === 'paid') return row;
        row = (
            await command(sales.agent, row.id, 'fulfill', row.version, {
                method: 'pickup',
            }).expect(201)
        ).body as OrderDetail;
        if (status === 'fulfilled') return row;
        return (
            await command(sales.agent, row.id, 'complete', row.version, {
                realizationNumber: 'DEMO-001',
                realizationDate: new Date().toISOString().slice(0, 10),
                documentDeliveryMethod: 'paper',
                documentKinds: ['act'],
            }).expect(201)
        ).body as OrderDetail;
    }
    const read = async (id: number) =>
        (await sales.agent.get(`/admin/api/orders/${id}`).expect(200))
            .body as OrderDetail;
    return {
        db,
        auth,
        password,
        sales,
        admin,
        operator,
        engineer,
        second,
        product,
        client,
        origin,
        buffer,
        create,
        command,
        quote,
        invoice,
        prepare,
        read,
    };
}

// Both commands must reach PostgreSQL's root-row lock before it is released.
export async function raceAtOrderLock(
    db: DataSource,
    id: number,
    commands: Array<() => PromiseLike<request.Response>>,
) {
    const blocker = db.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    const [{ pid }] = (await blocker.query(
        'SELECT pg_backend_pid() AS pid',
    )) as Array<{ pid: number }>;
    await blocker.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [id]);
    const pending = commands.map((command) => Promise.resolve(command()));
    try {
        const deadline = Date.now() + 15000;
        let blocked = 0;
        while (Date.now() < deadline) {
            const [{ count }] = await db.query<Array<{ count: number }>>(
                `WITH RECURSIVE blocked AS (
                    SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))
                    UNION
                    SELECT activity.pid FROM pg_stat_activity activity
                    JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
                ) SELECT COUNT(*)::int AS count FROM blocked`,
                [pid],
            );
            blocked = count;
            if (blocked >= commands.length) break;
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        assert.ok(
            blocked >= commands.length,
            'Both commands reached the database lock barrier',
        );
    } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
    }
    return Promise.all(pending);
}
