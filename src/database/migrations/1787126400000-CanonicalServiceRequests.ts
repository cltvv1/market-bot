import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalServiceRequests1787126400000
    implements MigrationInterface
{
    name = 'CanonicalServiceRequests1787126400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "service_form_definitions" (
                "id" SERIAL NOT NULL,
                "serviceTypeId" integer NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "supportedChannels" jsonb NOT NULL DEFAULT '["web","telegram","max","admin","phone"]'::jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_service_form_definition_type" UNIQUE ("serviceTypeId"),
                CONSTRAINT "PK_service_form_definitions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_service_form_definition_type" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "service_form_versions" (
                "id" SERIAL NOT NULL,
                "definitionId" integer NOT NULL,
                "version" integer NOT NULL,
                "status" character varying NOT NULL DEFAULT 'draft',
                "schema" jsonb NOT NULL,
                "handlerKey" character varying,
                "publishedAt" TIMESTAMP,
                "createdByStaffId" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_service_form_version" UNIQUE ("definitionId", "version"),
                CONSTRAINT "CK_service_form_version_status" CHECK ("status" IN ('draft','published','retired')),
                CONSTRAINT "PK_service_form_versions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_service_form_version_definition" FOREIGN KEY ("definitionId") REFERENCES "service_form_definitions"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_service_form_version_creator" FOREIGN KEY ("createdByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_service_form_versions_definition_status" ON "service_form_versions" ("definitionId", "status")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_service_form_published" ON "service_form_versions" ("definitionId") WHERE "status" = 'published'`,
        );

        await queryRunner.query(`
            CREATE TABLE "service_request_attachments" (
                "id" SERIAL NOT NULL,
                "serviceRequestId" integer NOT NULL,
                "storedFileId" integer NOT NULL,
                "kind" character varying NOT NULL DEFAULT 'customer',
                "customerVisible" boolean NOT NULL DEFAULT true,
                "uploadedByCustomerId" integer,
                "uploadedByStaffId" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_service_request_attachment_kind" CHECK ("kind" IN ('customer','invoice','payment_proof','generated_consent','signed_consent','message')),
                CONSTRAINT "PK_service_request_attachments" PRIMARY KEY ("id"),
                CONSTRAINT "FK_service_request_attachment_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_service_request_attachment_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_service_request_attachments_request" ON "service_request_attachments" ("serviceRequestId")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_service_request_attachment_role" ON "service_request_attachments" ("serviceRequestId", "storedFileId", "kind")`,
        );

        await queryRunner.query(`
            CREATE TABLE "service_request_messages" (
                "id" SERIAL NOT NULL,
                "serviceRequestId" integer NOT NULL,
                "authorType" character varying NOT NULL,
                "authorCustomerId" integer,
                "authorStaffId" integer,
                "visibility" character varying NOT NULL DEFAULT 'customer',
                "text" text,
                "storedFileId" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_service_request_message_author" CHECK ("authorType" IN ('customer','staff','system')),
                CONSTRAINT "CK_service_request_message_visibility" CHECK ("visibility" IN ('customer','internal')),
                CONSTRAINT "CK_service_request_message_content" CHECK ("text" IS NOT NULL OR "storedFileId" IS NOT NULL),
                CONSTRAINT "PK_service_request_messages" PRIMARY KEY ("id"),
                CONSTRAINT "FK_service_request_message_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_service_request_message_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_service_request_messages_request" ON "service_request_messages" ("serviceRequestId", "createdAt")`,
        );

        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "requestNumber" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "formVersionId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "cashRegisterId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "source" character varying NOT NULL DEFAULT 'legacy'`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "customerStatus" character varying NOT NULL DEFAULT 'received'`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "contactSnapshot" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "organizationSnapshot" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "locationSnapshot" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "equipmentSnapshot" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "responsibleOperatorStaffId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "publicTokenHash" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "submitIdempotencyKey" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "submittedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "completedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "closedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "cancelledAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "version" integer NOT NULL DEFAULT 1`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ALTER COLUMN "version" DROP DEFAULT`,
        );

        await queryRunner.query(`
            INSERT INTO "service_form_definitions" ("serviceTypeId")
            SELECT "id" FROM "service_types"
        `);
        await queryRunner.query(
            `ALTER TABLE "service_form_definitions" ALTER COLUMN "supportedChannels" DROP DEFAULT`,
        );
        await queryRunner.query(`
            INSERT INTO "service_form_versions" ("definitionId", "version", "status", "schema", "handlerKey", "publishedAt")
            SELECT d."id", 1, 'published',
                CASE WHEN t."flow" = 'fn_replacement' THEN
                    '{"fields":[{"key":"inn","type":"text","label":"ИНН","required":true,"maxLength":12},{"key":"cashRegisterIdentity","type":"text","label":"Касса или заводской номер","required":true,"maxLength":255},{"key":"fiscalDriveTerm","type":"select","label":"Срок ФН","required":true,"options":[{"value":"15","label":"15 месяцев"},{"value":"36","label":"36 месяцев"}]},{"key":"contactForCall","type":"phone","label":"Телефон для связи","required":true}],"maxAttachments":5}'::jsonb
                ELSE
                    '{"fields":[{"key":"problemDescription","type":"textarea","label":"Описание задачи","required":true,"maxLength":10000},{"key":"contactForCall","type":"phone","label":"Телефон для связи","required":true}],"maxAttachments":5}'::jsonb
                END,
                t."flow", now()
            FROM "service_form_definitions" d
            JOIN "service_types" t ON t."id" = d."serviceTypeId"
        `);

        await queryRunner.query(`
            UPDATE "service_requests" r SET
                "requestNumber" = 'SR-' || lpad(r."id"::text, 6, '0'),
                "formVersionId" = v."id",
                "source" = CASE WHEN r."platform" IN ('web','telegram','max') THEN r."platform" ELSE 'legacy' END,
                "customerStatus" = CASE
                    WHEN r."status" = 'clarification_required' THEN 'clarification_required'
                    WHEN r."status" IN ('invoice_required','price_confirmed','paid','in_progress') THEN 'accepted'
                    WHEN r."status" = 'waiting_payment' THEN 'waiting_for_customer'
                    WHEN r."status" = 'scheduled' THEN 'scheduled'
                    WHEN r."status" = 'completed' THEN 'completed'
                    WHEN r."status" = 'closed' THEN 'closed'
                    WHEN r."status" = 'cancelled' THEN 'cancelled'
                    ELSE 'received'
                END,
                "submittedAt" = CASE WHEN r."status" <> 'draft' THEN r."updatedAt" ELSE NULL END,
                "completedAt" = CASE WHEN r."status" = 'completed' THEN r."updatedAt" ELSE NULL END,
                "closedAt" = CASE WHEN r."status" = 'closed' THEN r."updatedAt" ELSE NULL END,
                "cancelledAt" = CASE WHEN r."status" = 'cancelled' THEN r."updatedAt" ELSE NULL END,
                "contactSnapshot" = jsonb_strip_nulls(jsonb_build_object(
                    'name', COALESCE((SELECT u."name" FROM "users" u WHERE u."id" = r."userId"), 'Клиент'),
                    'messenger', jsonb_build_object('platform', r."platform", 'chatId', r."chatId"),
                    'preferredChannel', r."platform"
                ))
            FROM "service_form_definitions" d
            JOIN "service_form_versions" v ON v."definitionId" = d."id" AND v."status" = 'published'
            WHERE d."serviceTypeId" = r."serviceTypeId"
        `);
        await queryRunner.query(`
            UPDATE "service_requests" SET
                "requestNumber" = 'SR-' || lpad("id"::text, 6, '0'),
                "source" = CASE WHEN "platform" IN ('web','telegram','max') THEN "platform" ELSE 'legacy' END
            WHERE "requestNumber" IS NULL
        `);
        await queryRunner.query(
            `ALTER TABLE "service_requests" ALTER COLUMN "requestNumber" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "UQ_service_requests_number" UNIQUE ("requestNumber")`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "UQ_service_requests_public_token" UNIQUE ("publicTokenHash")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_form_version" ON "service_requests" ("formVersionId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_cash_register" ON "service_requests" ("cashRegisterId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_responsible_staff" ON "service_requests" ("responsibleOperatorStaffId")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_service_requests_submit_idempotency" ON "service_requests" ("userId", "submitIdempotencyKey") WHERE "submitIdempotencyKey" IS NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_form_version" FOREIGN KEY ("formVersionId") REFERENCES "service_form_versions"("id") ON DELETE RESTRICT`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_responsible_staff" FOREIGN KEY ("responsibleOperatorStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL`,
        );

        await queryRunner.query(`
            CREATE FUNCTION assign_service_request_number() RETURNS trigger AS $$
            BEGIN
                IF NEW."requestNumber" IS NULL OR NEW."requestNumber" = '' THEN
                    NEW."requestNumber" := 'SR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(NEW."id"::text, 8, '0');
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        await queryRunner.query(`
            CREATE TRIGGER "TR_service_request_assign_number"
            BEFORE INSERT ON "service_requests"
            FOR EACH ROW EXECUTE FUNCTION assign_service_request_number()
        `);

        await queryRunner.query(`
            INSERT INTO "service_request_attachments" ("serviceRequestId", "storedFileId", "kind", "customerVisible")
            SELECT "id", "invoiceStoredFileId", 'invoice', true FROM "service_requests" WHERE "invoiceStoredFileId" IS NOT NULL
            UNION ALL
            SELECT "id", "paymentProofFileId", 'payment_proof', true FROM "service_requests" WHERE "paymentProofFileId" IS NOT NULL
            UNION ALL
            SELECT "id", "generatedConsentFileId", 'generated_consent', true FROM "service_requests" WHERE "generatedConsentFileId" IS NOT NULL
            UNION ALL
            SELECT "id", "signedConsentFileId", 'signed_consent', true FROM "service_requests" WHERE "signedConsentFileId" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE FUNCTION reject_published_service_form_change() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE' AND OLD."status" = 'published' THEN
                    RAISE EXCEPTION 'Published service form versions are immutable';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD."status" = 'published' AND (
                    NEW."definitionId" IS DISTINCT FROM OLD."definitionId" OR
                    NEW."version" IS DISTINCT FROM OLD."version" OR
                    NEW."schema" IS DISTINCT FROM OLD."schema" OR
                    NEW."handlerKey" IS DISTINCT FROM OLD."handlerKey" OR
                    NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR
                    NEW."createdByStaffId" IS DISTINCT FROM OLD."createdByStaffId"
                ) THEN
                    RAISE EXCEPTION 'Published service form versions are immutable';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        await queryRunner.query(`
            CREATE TRIGGER "TR_service_form_published_immutable"
            BEFORE UPDATE OR DELETE ON "service_form_versions"
            FOR EACH ROW EXECUTE FUNCTION reject_published_service_form_change()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP TRIGGER "TR_service_request_assign_number" ON "service_requests"`,
        );
        await queryRunner.query(`DROP FUNCTION assign_service_request_number`);
        await queryRunner.query(
            `DROP TRIGGER "TR_service_form_published_immutable" ON "service_form_versions"`,
        );
        await queryRunner.query(
            `DROP FUNCTION reject_published_service_form_change`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_responsible_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_cash_register"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_form_version"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_submit_idempotency"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_responsible_staff"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_cash_register"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_form_version"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "UQ_service_requests_public_token"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "UQ_service_requests_number"`,
        );
        for (const column of [
            'version',
            'cancelledAt',
            'closedAt',
            'completedAt',
            'submittedAt',
            'submitIdempotencyKey',
            'publicTokenHash',
            'responsibleOperatorStaffId',
            'equipmentSnapshot',
            'locationSnapshot',
            'organizationSnapshot',
            'contactSnapshot',
            'customerStatus',
            'source',
            'cashRegisterId',
            'formVersionId',
            'requestNumber',
        ]) {
            await queryRunner.query(
                `ALTER TABLE "service_requests" DROP COLUMN "${column}"`,
            );
        }
        await queryRunner.query(`DROP TABLE "service_request_messages"`);
        await queryRunner.query(`DROP TABLE "service_request_attachments"`);
        await queryRunner.query(`DROP TABLE "service_form_versions"`);
        await queryRunner.query(`DROP TABLE "service_form_definitions"`);
    }
}
