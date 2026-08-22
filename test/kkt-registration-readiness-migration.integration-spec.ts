import { DataSource, type MigrationInterface } from 'typeorm';
import { InitialSchema1785067383157 } from '../src/database/migrations/1785067383157-InitialSchema';
import { SecurityFoundation1785079000000 } from '../src/database/migrations/1785079000000-SecurityFoundation';
import { FileStorageAndAudit1785085000000 } from '../src/database/migrations/1785085000000-FileStorageAndAudit';
import { ServiceRequestPaymentProof1785226500000 } from '../src/database/migrations/1785226500000-ServiceRequestPaymentProof';
import { IntegrationFoundation1786953600000 } from '../src/database/migrations/1786953600000-IntegrationFoundation';
import { OrganizationAccessRequests1787040000000 } from '../src/database/migrations/1787040000000-OrganizationAccessRequests';
import { CanonicalServiceRequests1787126400000 } from '../src/database/migrations/1787126400000-CanonicalServiceRequests';
import { KktRegistrationReadiness1787212800000 } from '../src/database/migrations/1787212800000-KktRegistrationReadiness';

const FIXTURE_DATABASE = 'vitma_bkv12_migration_fixture_test';

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
    CanonicalServiceRequests1787126400000,
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

describe('KKT registration readiness legacy migration', () => {
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
        expect(await legacy.runMigrations()).toHaveLength(7);
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

    it('preserves rows and backfills exact kit values without guessing photo semantics', async () => {
        migrated = fixtureDataSource([
            ...legacyMigrations,
            KktRegistrationReadiness1787212800000,
        ]);
        await migrated.initialize();

        expect(await migrated.runMigrations()).toHaveLength(1);

        const registrations = await migrated.query<
            Array<{
                id: number;
                readiness: string;
                ofdProvisionMode: string;
                handedOff: boolean;
            }>
        >(`
            SELECT id, readiness, "ofdProvisionMode",
                   ("handedOffAt" IS NOT NULL) AS "handedOff"
            FROM registration_requests ORDER BY id
        `);
        expect(registrations).toEqual([
            {
                id: 4001,
                readiness: 'incomplete',
                ofdProvisionMode: 'clarification_required',
                handedOff: false,
            },
            {
                id: 4002,
                readiness: 'ready',
                ofdProvisionMode: 'not_applicable',
                handedOff: true,
            },
            ...[4003, 4004, 4005].map((id) => ({
                id,
                readiness: 'incomplete',
                ofdProvisionMode: 'clarification_required',
                handedOff: false,
            })),
            {
                id: 4006,
                readiness: 'ready',
                ofdProvisionMode: 'not_applicable',
                handedOff: false,
            },
        ]);

        const requirements = await migrated.query<
            Array<{
                registrationId: number;
                kind: string;
                status: string;
                value: string | null;
                source: string | null;
            }>
        >(`
            SELECT "registrationId", kind, status, value, source
            FROM registration_requirements
            ORDER BY "registrationId", kind
        `);
        expect(
            requirements.filter((item) => item.registrationId === 4001),
        ).toEqual([
            {
                registrationId: 4001,
                kind: 'fiscal_drive_serial',
                status: 'provided',
                value: 'FN-SYNTHETIC-1',
                source: 'internal_registry',
            },
            {
                registrationId: 4001,
                kind: 'kkt_serial',
                status: 'provided',
                value: 'KKT-SYNTHETIC-1',
                source: 'internal_registry',
            },
            {
                registrationId: 4001,
                kind: 'ofd_code',
                status: 'provided',
                value: 'OFD-SYNTHETIC-1',
                source: 'internal_registry',
            },
        ]);
        expect(
            requirements
                .filter((item) => item.registrationId === 4002)
                .every(
                    (item) =>
                        item.status === 'verified' &&
                        item.source === 'internal_registry' &&
                        Boolean(item.value),
                ),
        ).toBe(true);
        expect(
            requirements.filter(
                (item) => item.registrationId === 4003 && item.value,
            ),
        ).toEqual([
            expect.objectContaining({
                kind: 'kkt_serial',
                value: 'KKT-SYNTHETIC-ONLY',
                status: 'provided',
            }),
        ]);
        expect(
            requirements.filter(
                (item) => item.registrationId === 4004 && item.value,
            ),
        ).toEqual([
            expect.objectContaining({
                kind: 'fiscal_drive_serial',
                value: 'FN-SYNTHETIC-ONLY',
                status: 'provided',
            }),
        ]);
        expect(
            requirements.filter(
                (item) => item.registrationId === 4005 && item.value,
            ),
        ).toEqual([
            expect.objectContaining({
                kind: 'ofd_code',
                value: 'OFD-SYNTHETIC-ONLY',
                status: 'provided',
            }),
        ]);
        expect(
            requirements
                .filter((item) => item.registrationId === 4006)
                .every((item) => item.status === 'not_required'),
        ).toBe(true);

        const evidence = await migrated.query<
            Array<{
                registrationId: number;
                requirementId: number | null;
                storedFileId: number;
                kind: string;
            }>
        >(`
            SELECT "registrationId", "requirementId", "storedFileId", kind
            FROM registration_evidence
        `);
        expect(evidence).toEqual([
            {
                registrationId: 4001,
                requirementId: null,
                storedFileId: 3001,
                kind: 'legacy_photo',
            },
            {
                registrationId: 4005,
                requirementId: null,
                storedFileId: 3002,
                kind: 'legacy_photo',
            },
        ]);
        expect(await migrated.runMigrations()).toEqual([]);
        expect(
            await migrated.query(
                `SELECT count(*)::int AS count FROM registration_requests`,
            ),
        ).toEqual([{ count: 6 }]);
        expect(
            await migrated.query(
                `SELECT count(*)::int AS count FROM stored_files`,
            ),
        ).toEqual([{ count: 2 }]);
    }, 60_000);
});

async function seedLegacyFixture(dataSource: DataSource) {
    await dataSource.query(`
        INSERT INTO equipment_kits
            (id, "cashRegisterSerial", "fiscalDriveSerial", "ofdActivationCode")
        VALUES
            (2001, 'KKT-SYNTHETIC-1', 'FN-SYNTHETIC-1', 'OFD-SYNTHETIC-1'),
            (2002, 'KKT-SYNTHETIC-ONLY', NULL, NULL),
            (2003, NULL, 'FN-SYNTHETIC-ONLY', NULL),
            (2004, NULL, NULL, 'OFD-SYNTHETIC-ONLY'),
            (2005, 'KKT-SYNTHETIC-DONE', 'FN-SYNTHETIC-DONE', 'OFD-SYNTHETIC-DONE')
    `);
    await dataSource.query(`
        INSERT INTO stored_files
            (id, provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256, status)
        VALUES
            (3001, 'local', 'synthetic/legacy-photo.jpg', 'legacy-photo.jpg',
             'image/jpeg', 4, repeat('0', 64), 'active'),
            (3002, 'local', 'synthetic/missing-photo.jpg', 'missing-photo.jpg',
             'image/jpeg', 4, repeat('1', 64), 'missing')
    `);
    await dataSource.query(`
        INSERT INTO registration_requests
            (id, "chatId", platform, "currentStep", "equipmentKitId",
             "equipmentPhotoFileId", "isFilled", "isProcessed", status)
        VALUES
            (4001, 'synthetic-active', 'telegram', 99, 2001, 3001, true, false, 'new'),
            (4002, 'synthetic-processed', 'max', 99, 2005, NULL, true, true, 'processed'),
            (4003, 'synthetic-kkt-only', 'telegram', 99, 2002, NULL, true, false, 'new'),
            (4004, 'synthetic-fn-only', 'max', 99, 2003, NULL, true, false, 'new'),
            (4005, 'synthetic-ofd-only', 'web', 99, 2004, 3002, true, false, 'new'),
            (4006, 'synthetic-stopped', 'telegram', 2, NULL, NULL, false, false, 'new')
    `);
    await dataSource.query(
        `UPDATE registration_requests SET "isStopped"=true WHERE id=4006`,
    );
}
