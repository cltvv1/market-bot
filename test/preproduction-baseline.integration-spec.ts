import type { DataSource } from 'typeorm';
import testDataSource from '../src/database/test-data-source';

describe('pre-production database baseline', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = testDataSource;
        if (!dataSource.isInitialized) await dataSource.initialize();
    });

    afterAll(async () => {
        if (dataSource.isInitialized) await dataSource.destroy();
    });

    it('records the reviewed current migration chain', async () => {
        const migrations: Array<{ name: string }> = await dataSource.query(
            `SELECT name FROM typeorm_migrations ORDER BY id`,
        );

        expect(migrations).toEqual([
            { name: 'InitialPreproductionBaseline1787388476982' },
            { name: 'AddDurableInboundCommands1787577304950' },
            { name: 'AddDurableOutboundDeliveries1787664000000' },
            { name: 'AuthorizeStaffNotifications1787750400000' },
            { name: 'AddCatalogFoundation1787836800000' },
            { name: 'AddSupportKnowledgeFoundation1787923200000' },
            { name: 'HardenFileLifecycle1788009600000' },
            { name: 'AddOrderIntakeFoundation1788096000000' },
            { name: 'AddOrderSalesWorkspaceCore1788182400000' },
            { name: 'AddOrderInvoicePaymentWorkflow1788268800000' },
            {
                name: 'AddOrderFulfillmentCompletionWorkflow1788355200000',
            },
        ]);
    });

    it('contains canonical service-request and registration tables', async () => {
        const expected = [
            'service_requests',
            'service_form_definitions',
            'service_form_versions',
            'service_request_attachments',
            'service_request_messages',
            'registration_requests',
            'registration_requirements',
            'registration_evidence',
            'registration_data_requests',
            'stored_files',
            'organization_access_requests',
            'inbound_commands',
            'user_dialog_states',
            'outbound_deliveries',
            'catalog_categories',
            'catalog_products',
            'catalog_product_aliases',
            'product_support_profiles',
            'support_resources',
            'support_resource_versions',
            'product_support_resources',
            'knowledge_articles',
            'product_knowledge_articles',
            'knowledge_article_support_resources',
        ];
        const rows: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = ANY($1::text[])
             ORDER BY table_name`,
            [expected],
        );

        expect(rows.map((row) => row.table_name)).toEqual(expected.sort());
    });

    it('does not contain discarded tables or compatibility columns', async () => {
        const discardedTables = ['bids', 'bid_fields'];
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
            [discardedTables],
        );
        expect(tables).toEqual([]);

        const discardedColumns: Record<string, string[]> = {
            admin_users: ['role'],
            users: ['sendNews', 'sendImportant', 'isAdmin', 'isOperator'],
            ticket_messages: [
                'fileId',
                'fileUniqueId',
                'fileName',
                'mimeType',
                'fileSize',
                'externalUrl',
                'localPath',
            ],
            service_requests: [
                'invoiceFileId',
                'invoiceFileName',
                'responsibleOperatorId',
                'executorName',
            ],
            registration_requests: [
                'type',
                'equipmentPhotoPath',
                'equipmentPhotoName',
                'equipmentPhotoFileId',
                'isFilled',
                'isStopped',
                'isProcessed',
                'pdfLink',
                'pdfPath',
            ],
        };
        const columns: Array<{ table_name: string; column_name: string }> =
            await dataSource.query(
                `SELECT table_name, column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = ANY($1::text[])
                   AND column_name = ANY($2::text[])`,
                [
                    Object.keys(discardedColumns),
                    Object.values(discardedColumns).flat(),
                ],
            );
        expect(columns).toEqual([]);

        const discardedEnums: Array<{ typname: string }> =
            await dataSource.query(
                `SELECT type.typname
                 FROM pg_type type
                 JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
                 WHERE namespace.nspname = 'public'
                   AND type.typname IN ('registration_requests_type_enum', 'bids_type_enum')`,
            );
        expect(discardedEnums).toEqual([]);
    });

    it('contains only current registration requirement and evidence values', async () => {
        const constraints: Array<{ definition: string }> =
            await dataSource.query(
                `SELECT pg_get_constraintdef(oid) AS definition
             FROM pg_constraint
             WHERE conname IN (
               'CK_registration_requirement_source',
               'CK_registration_evidence_kind'
             )
             ORDER BY conname`,
            );
        const definitions = constraints.map((row) => row.definition).join('\n');

        expect(definitions).toContain('external_system');
        expect(definitions).toContain('internal_registry');
        expect(definitions).not.toContain('legacy');
    });

    it('accepts relative object keys and rejects traversal segments', async () => {
        const sha256 = 'a'.repeat(64);
        await dataSource.query(
            `INSERT INTO stored_files
             (provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256)
             VALUES ('local', 'ab/file.txt', 'file.txt', 'text/plain', 1, $1)`,
            [sha256],
        );

        await expect(
            dataSource.query(
                `INSERT INTO stored_files
                 (provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256)
                 VALUES ('local', 'safe/../secret.txt', 'secret.txt', 'text/plain', 1, $1)`,
                [sha256],
            ),
        ).rejects.toThrow();
    });

    it('contains the reviewed StoredFile lifecycle columns and status', async () => {
        const columns: Array<{ column_name: string }> = await dataSource.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'stored_files'
               AND column_name = ANY($1::text[])
             ORDER BY column_name`,
            [
                [
                    'deletedAt',
                    'missingAt',
                    'lastVerifiedAt',
                    'corruptAt',
                    'purgeAfter',
                    'purgedAt',
                ],
            ],
        );
        expect(columns.map((column) => column.column_name)).toEqual(
            [
                'corruptAt',
                'deletedAt',
                'lastVerifiedAt',
                'missingAt',
                'purgeAfter',
                'purgedAt',
            ].sort(),
        );
        const constraints: Array<{ definition: string }> =
            await dataSource.query(
                `SELECT pg_get_constraintdef(oid) AS definition
                 FROM pg_constraint
                 WHERE conname = 'CK_stored_files_status'`,
            );
        expect(constraints[0].definition).toContain('corrupt');
    });
});
