import { DataSource, type MigrationInterface } from 'typeorm';
import { InitialSchema1785067383157 } from '../src/database/migrations/1785067383157-InitialSchema';
import { SecurityFoundation1785079000000 } from '../src/database/migrations/1785079000000-SecurityFoundation';
import { FileStorageAndAudit1785085000000 } from '../src/database/migrations/1785085000000-FileStorageAndAudit';
import { ServiceRequestPaymentProof1785226500000 } from '../src/database/migrations/1785226500000-ServiceRequestPaymentProof';
import { IntegrationFoundation1786953600000 } from '../src/database/migrations/1786953600000-IntegrationFoundation';
import { OrganizationAccessRequests1787040000000 } from '../src/database/migrations/1787040000000-OrganizationAccessRequests';
import { CanonicalServiceRequests1787126400000 } from '../src/database/migrations/1787126400000-CanonicalServiceRequests';

const FIXTURE_DATABASE = 'vitma_bkv11_migration_fixture_test';
function required(name: string, fallbackName?: string) {
    const value =
        process.env[name]?.trim() ||
        (fallbackName ? process.env[fallbackName]?.trim() : '');
    if (!value) throw new Error(`Missing test database setting: ${name}`);
    return value;
}

const connection = {
    type: 'postgres' as const,
    host: required('TEST_DB_HOST', 'DB_HOST'),
    port: Number(required('TEST_DB_PORT', 'DB_PORT')),
    username: required('TEST_DB_USER', 'DB_USER'),
    password: required('TEST_DB_PASS', 'DB_PASS'),
};

type MigrationClass = new () => MigrationInterface;
const legacyMigrations: MigrationClass[] = [
    InitialSchema1785067383157,
    SecurityFoundation1785079000000,
    FileStorageAndAudit1785085000000,
    ServiceRequestPaymentProof1785226500000,
    IntegrationFoundation1786953600000,
    OrganizationAccessRequests1787040000000,
];

function fixtureDataSource(migrations: MigrationClass[]) {
    return new DataSource({
        ...connection,
        database: FIXTURE_DATABASE,
        migrations,
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
    });
}

describe('CanonicalServiceRequests legacy migration', () => {
    let admin: DataSource;
    let legacy: DataSource;
    let migrated: DataSource;

    beforeAll(async () => {
        admin = new DataSource({
            ...connection,
            database: process.env.TEST_DB_ADMIN_NAME?.trim() || 'postgres',
        });
        await admin.initialize();
        await admin.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [FIXTURE_DATABASE],
        );
        await admin.query(`DROP DATABASE IF EXISTS "${FIXTURE_DATABASE}"`);
        await admin.query(`CREATE DATABASE "${FIXTURE_DATABASE}"`);

        legacy = fixtureDataSource(legacyMigrations);
        await legacy.initialize();
        expect(await legacy.runMigrations()).toHaveLength(6);
        await seedLegacyFixture(legacy);
        await legacy.destroy();
    }, 60_000);

    afterAll(async () => {
        if (migrated?.isInitialized) await migrated.destroy();
        if (legacy?.isInitialized) await legacy.destroy();
        if (admin) {
            await admin.query(
                'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
                [FIXTURE_DATABASE],
            );
            await admin.query(`DROP DATABASE IF EXISTS "${FIXTURE_DATABASE}"`);
            await admin.destroy();
        }
    }, 30_000);

    it('preserves legacy requests and safely backfills canonical fields', async () => {
        migrated = fixtureDataSource([
            ...legacyMigrations,
            CanonicalServiceRequests1787126400000,
        ]);
        await migrated.initialize();

        const before = await migrated.query<
            Array<{ requests: string; events: string; files: string }>
        >(`
            SELECT
                (SELECT count(*) FROM service_requests)::text AS requests,
                (SELECT count(*) FROM service_request_events)::text AS events,
                (SELECT count(*) FROM stored_files)::text AS files
        `);
        expect(before[0]).toEqual({ requests: '4', events: '4', files: '5' });

        expect(await migrated.runMigrations()).toHaveLength(1);

        const requests = await migrated.query<
            Array<{
                id: number;
                status: string;
                source: string;
                customerStatus: string;
                answers: Record<string, unknown>;
                requestNumber: string;
                contactSnapshot: Record<string, unknown>;
                calculatedPrice: number | null;
                visitAddress: string | null;
                assignedEngineerId: number | null;
                operatorComment: string | null;
            }>
        >(`
            SELECT id, status, source, "customerStatus", answers,
                   "requestNumber", "contactSnapshot", "calculatedPrice",
                   "visitAddress", "assignedEngineerId", "operatorComment"
            FROM service_requests ORDER BY id
        `);

        expect(requests).toHaveLength(4);
        expect(requests.map((item) => item.id)).toEqual([
            1001, 1002, 1003, 1004,
        ]);
        expect(requests[0]).toMatchObject({
            status: 'paid',
            source: 'telegram',
            customerStatus: 'accepted',
            requestNumber: 'SR-001001',
            calculatedPrice: 15900,
            visitAddress: 'Synthetic office',
            assignedEngineerId: 1001,
            operatorComment: 'Synthetic internal note',
        });
        expect(requests[0].answers).toEqual({
            inn: '0000000000',
            cashRegisterIdentity: 'SYNTHETIC-KKT',
            fiscalDriveTerm: '15',
            contactForCall: '+70000000000',
        });
        expect(requests[1]).toMatchObject({
            status: 'completed',
            source: 'max',
            customerStatus: 'completed',
        });
        expect(requests[1].answers).toEqual({
            city: 'Test City',
            clientName: 'Synthetic Client',
            inn: '0000000000',
            representativeName: 'Synthetic Person',
            representativeBasis: 'Synthetic Basis',
        });
        expect(requests[2]).toMatchObject({
            status: 'legacy_unmapped',
            source: 'legacy',
            customerStatus: 'received',
        });
        expect(requests[2].answers).toEqual({ nested: { accepted: true } });
        expect(requests[2].contactSnapshot).toEqual({ name: 'Клиент' });
        expect(requests[3]).toMatchObject({
            status: 'scheduled',
            source: 'web',
            customerStatus: 'scheduled',
        });

        const atolForm = await migrated.query<
            Array<{ handlerKey: string; keys: string[] }>
        >(`
            SELECT v."handlerKey",
                   array_agg(field->>'key' ORDER BY field_index) AS keys
            FROM service_form_versions v
            JOIN service_form_definitions d ON d.id=v."definitionId"
            JOIN service_types t ON t.id=d."serviceTypeId"
            CROSS JOIN LATERAL jsonb_array_elements(v.schema->'fields')
                WITH ORDINALITY AS fields(field, field_index)
            WHERE t.code='atol_consent' AND v.status='published'
            GROUP BY v."handlerKey"
        `);
        expect(atolForm).toEqual([
            {
                handlerKey: 'atol_consent',
                keys: [
                    'city',
                    'clientName',
                    'inn',
                    'representativeName',
                    'representativeBasis',
                ],
            },
        ]);

        const attachments = await migrated.query<
            Array<{ serviceRequestId: number; kind: string }>
        >(`
            SELECT "serviceRequestId", kind
            FROM service_request_attachments
            ORDER BY "serviceRequestId", kind
        `);
        expect(attachments).toEqual([
            { serviceRequestId: 1001, kind: 'invoice' },
            { serviceRequestId: 1001, kind: 'payment_proof' },
            { serviceRequestId: 1002, kind: 'generated_consent' },
            { serviceRequestId: 1002, kind: 'signed_consent' },
        ]);

        const after = await migrated.query<
            Array<{ requests: string; events: string; files: string }>
        >(`
            SELECT
                (SELECT count(*) FROM service_requests)::text AS requests,
                (SELECT count(*) FROM service_request_events)::text AS events,
                (SELECT count(*) FROM stored_files)::text AS files
        `);
        expect(after[0]).toEqual(before[0]);
        expect(await migrated.runMigrations()).toEqual([]);
        expect(
            await migrated.query(`
                SELECT "requestNumber", count(*)
                FROM service_requests GROUP BY "requestNumber"
                HAVING count(*) > 1
            `),
        ).toEqual([]);
        expect(
            await migrated.query(`
                SELECT "serviceRequestId", "storedFileId", kind, count(*)
                FROM service_request_attachments
                GROUP BY "serviceRequestId", "storedFileId", kind
                HAVING count(*) > 1
            `),
        ).toEqual([]);
    }, 60_000);
});

async function seedLegacyFixture(dataSource: DataSource) {
    await dataSource.query(`
        INSERT INTO service_types (id, code, title, flow) VALUES
            (101, 'kkt_remote_work', 'Synthetic simple service', 'simple'),
            (102, 'fn_replacement', 'Synthetic FN replacement', 'fn_replacement'),
            (103, 'atol_consent', 'Synthetic ATOL consent', 'simple')
    `);
    await dataSource.query(`
        INSERT INTO users (id, "chatId", platform, name) VALUES
            (1001, 'synthetic-telegram', 'telegram', 'Synthetic Telegram'),
            (1002, 'synthetic-max', 'max', 'Synthetic MAX')
    `);
    await dataSource.query(`
        INSERT INTO admin_users
            (id, login, "displayName", "passwordHash", role)
        VALUES (1001, 'synthetic-engineer', 'Synthetic Engineer', 'not-a-real-hash', 'operator')
    `);
    await dataSource.query(`
        INSERT INTO admin_user_roles ("userId", role)
        VALUES (1001, 'engineer')
    `);
    await dataSource.query(`
        INSERT INTO stored_files
            (id, provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256)
        VALUES
            (1001, 'local', 'synthetic/invoice.pdf', 'invoice.pdf', 'application/pdf', 1, repeat('1', 64)),
            (1002, 'local', 'synthetic/payment.pdf', 'payment.pdf', 'application/pdf', 1, repeat('2', 64)),
            (1003, 'local', 'synthetic/generated.pdf', 'generated.pdf', 'application/pdf', 1, repeat('3', 64)),
            (1004, 'local', 'synthetic/signed.pdf', 'signed.pdf', 'application/pdf', 1, repeat('4', 64)),
            (1005, 'local', 'synthetic/customer.pdf', 'customer.pdf', 'application/pdf', 1, repeat('5', 64))
    `);
    await dataSource.query(`
        INSERT INTO service_requests
            (id, "serviceTypeId", "serviceTypeCode", "serviceTypeTitle", "userId",
             platform, "chatId", status, answers, "calculatedPrice", "visitAddress",
             "visitTime", "operatorComment", "assignedEngineerId", priority,
             "invoiceStoredFileId", "paymentProofFileId", "createdAt", "updatedAt")
        VALUES
            (1001, 102, 'fn_replacement', 'Synthetic FN replacement', 1001,
             'telegram', 'synthetic-telegram', 'paid',
             '{"inn":"0000000000","cashRegisterIdentity":"SYNTHETIC-KKT","fiscalDriveTerm":"15","contactForCall":"+70000000000"}',
             15900, 'Synthetic office', '2026-01-02T10:00:00Z', 'Synthetic internal note', 1001,
             'high', 1001, 1002, '2026-01-01T10:00:00Z', '2026-01-02T10:00:00Z'),
            (1002, 103, 'atol_consent', 'Synthetic ATOL consent', 1002,
             'max', 'synthetic-max', 'completed',
             '{"city":"Test City","clientName":"Synthetic Client","inn":"0000000000","representativeName":"Synthetic Person","representativeBasis":"Synthetic Basis"}',
             NULL, NULL, NULL, NULL, NULL, 'normal', NULL, NULL,
             '2026-01-03T10:00:00Z', '2026-01-04T10:00:00Z'),
            (1003, 101, 'kkt_remote_work', 'Synthetic simple service', NULL,
             'legacy_unknown', 'synthetic-unknown', 'legacy_unmapped',
             '{"nested":{"accepted":true}}', NULL, NULL, NULL, NULL, NULL,
             'normal', NULL, NULL, '2026-01-05T10:00:00Z', '2026-01-05T10:00:00Z'),
            (1004, 101, 'kkt_remote_work', 'Synthetic simple service', NULL,
             'web', 'synthetic-web', 'scheduled',
             '{"problemDescription":"Synthetic description","contactForCall":"+70000000000"}',
             NULL, 'Synthetic visit', '2026-01-06T10:00:00Z', NULL, NULL,
             'normal', NULL, NULL, '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')
    `);
    await dataSource.query(`
        UPDATE service_requests SET
            "generatedConsentFileId"=1003,
            "signedConsentFileId"=1004
        WHERE id=1002
    `);
    await dataSource.query(`
        INSERT INTO service_request_events
            (id, "serviceRequestId", type, actor, message, payload, "createdAt")
        VALUES
            (1001, 1001, 'created', 'client', 'Synthetic event', '{}', '2026-01-01T10:00:00Z'),
            (1002, 1001, 'payment_received', 'operator', 'Synthetic event', '{}', '2026-01-02T10:00:00Z'),
            (1003, 1002, 'completed', 'operator', 'Synthetic event', '{}', '2026-01-04T10:00:00Z'),
            (1004, 1003, 'created', 'client', 'Synthetic event', '{}', '2026-01-05T10:00:00Z')
    `);
}
