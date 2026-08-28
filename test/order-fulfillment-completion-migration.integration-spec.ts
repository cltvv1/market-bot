import { randomUUID } from 'node:crypto';
import testDataSource from '../src/database/test-data-source';

describe('CO-3C existing-data migration drill', () => {
    beforeAll(async () => {
        await testDataSource.initialize();
    });

    afterAll(async () => {
        if (testDataSource.isInitialized) await testDataSource.destroy();
    });

    it('reverts to CO-3B data and reapplies CO-3C without rewriting facts', async () => {
        const tables: Array<{ table_name: string }> =
            await testDataSource.query(
                `SELECT table_name FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                   AND table_name <> 'typeorm_migrations' ORDER BY table_name`,
            );
        await testDataSource.query(
            `TRUNCATE TABLE ${tables
                .map(
                    ({ table_name }) =>
                        `"public"."${table_name.replaceAll('"', '""')}"`,
                )
                .join(', ')} RESTART IDENTITY CASCADE`,
        );
        await testDataSource.query(
            `INSERT INTO "users" ("chatId","platform") VALUES ('co3c-upgrade-user','web')`,
        );
        await testDataSource.query(
            `INSERT INTO "admin_users" ("login","displayName","passwordHash")
             VALUES ('co3c-upgrade-manager','Upgrade Manager','synthetic-hash')`,
        );

        const statuses = [
            'submitted',
            'in_review',
            'confirmed',
            'waiting_payment',
            'paid',
        ] as const;
        for (const [position, status] of statuses.entries()) {
            const paid = status === 'paid';
            await testDataSource.query(
                `INSERT INTO "orders" (
                    "createdByUserId","idempotencyKey","submissionFingerprint",
                    "status","version","assignedManagerId","assignedAt","confirmedAt",
                    "invoiceIssuedAt","paymentReceivedAt","paymentConfirmedAt",
                    "paymentConfirmedByStaffId","paymentConfirmationSource",
                    "paymentConfirmationComment","customerType","contactNameSnapshot",
                    "contactPhoneSnapshot","deliveryType","catalogPricedSubtotalMinor",
                    "hasUnpricedItems","currency")
                 VALUES (1,$1,$2,$3::varchar,$4,1,now(),
                    CASE WHEN $3::varchar IN ('confirmed','waiting_payment','paid') THEN now() ELSE NULL END,
                    CASE WHEN $3::varchar IN ('waiting_payment','paid') THEN now() ELSE NULL END,
                    CASE WHEN $5::boolean THEN now() - interval '1 minute' ELSE NULL END,
                    CASE WHEN $5::boolean THEN now() ELSE NULL END,
                    CASE WHEN $5::boolean THEN 1 ELSE NULL END,
                    CASE WHEN $5::boolean THEN 'bank_statement' ELSE NULL END,
                    CASE WHEN $5::boolean THEN 'preserved internal comment' ELSE NULL END,
                    'individual','Upgrade Customer','+79990000000','pickup',3100000,false,'RUB')`,
                [
                    randomUUID(),
                    String(position + 1)
                        .repeat(64)
                        .slice(0, 64),
                    status,
                    position + 1,
                    paid,
                ],
            );
            await testDataSource.query(
                `INSERT INTO "order_events" (
                    "orderId","type","fromStatus","toStatus","actorType",
                    "actorUserId","actorStaffId","visibility")
                 VALUES ($1,'submitted',NULL,'submitted','customer',1,NULL,'customer')`,
                [position + 1],
            );
        }

        const before: Array<Record<string, unknown>> =
            await testDataSource.query(
                `SELECT "id","status","version","assignedManagerId","confirmedAt",
                        "invoiceIssuedAt","paymentReceivedAt","paymentConfirmedAt",
                        "paymentConfirmedByStaffId","paymentConfirmationSource",
                        "paymentConfirmationComment"
                 FROM "orders" ORDER BY "id"`,
            );
        const eventCountBefore: Array<{ count: string }> =
            await testDataSource.query(`SELECT count(*) FROM "order_events"`);

        let reverted = false;
        try {
            await testDataSource.undoLastMigration();
            reverted = true;
            const migrations: Array<{ name: string }> =
                await testDataSource.query(
                    `SELECT "name" FROM "typeorm_migrations" ORDER BY "id"`,
                );
            expect(migrations.at(-1)?.name).toBe(
                'AddOrderInvoicePaymentWorkflow1788268800000',
            );
            const missingColumns: Array<{ column_name: string }> =
                await testDataSource.query(
                    `SELECT column_name FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'orders'
                       AND column_name IN ('fulfilledAt','completedAt','realizationNumber')`,
                );
            expect(missingColumns).toHaveLength(0);

            await testDataSource.runMigrations();
            reverted = false;
        } finally {
            if (reverted) await testDataSource.runMigrations();
        }

        const after: Array<Record<string, unknown>> =
            await testDataSource.query(
                `SELECT "id","status","version","assignedManagerId","confirmedAt",
                        "invoiceIssuedAt","paymentReceivedAt","paymentConfirmedAt",
                        "paymentConfirmedByStaffId","paymentConfirmationSource",
                        "paymentConfirmationComment"
                 FROM "orders" ORDER BY "id"`,
            );
        expect(after).toEqual(before);
        expect(
            await testDataSource.query(`SELECT count(*) FROM "order_events"`),
        ).toEqual(eventCountBefore);
        const addedFacts: Array<Record<string, unknown>> =
            await testDataSource.query(
                `SELECT "fulfilledAt","fulfilledByStaffId","fulfillmentMethod",
                        "completedAt","completedByStaffId","realizationNumber",
                        "realizationDate","finalDocumentsDeliveryMethod",
                        "finalDocumentKinds","finalDocumentsDeliveredAt"
                 FROM "orders"`,
            );
        expect(addedFacts).toHaveLength(5);
        for (const fact of addedFacts) {
            expect(Object.values(fact).every((value) => value === null)).toBe(
                true,
            );
        }
    });
});
