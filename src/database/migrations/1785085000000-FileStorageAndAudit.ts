import { MigrationInterface, QueryRunner } from 'typeorm';

export class FileStorageAndAudit1785085000000 implements MigrationInterface {
    name = 'FileStorageAndAudit1785085000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "stored_files" (
                "id" SERIAL NOT NULL,
                "provider" character varying NOT NULL DEFAULT 'local',
                "objectKey" character varying NOT NULL,
                "originalName" character varying NOT NULL,
                "mimeType" character varying NOT NULL,
                "sizeBytes" bigint NOT NULL,
                "sha256" character(64) NOT NULL,
                "status" character varying NOT NULL DEFAULT 'active',
                "createdByStaffId" integer,
                "createdByCustomerId" integer,
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_stored_files" PRIMARY KEY ("id"),
                CONSTRAINT "CK_stored_files_object_key_relative" CHECK ("objectKey" !~ '(^[\\\\/]|^[A-Za-z]:|(^|[\\\\/])\\.\\.([\\\\/]|$))'),
                CONSTRAINT "CK_stored_files_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
                CONSTRAINT "CK_stored_files_size" CHECK ("sizeBytes" >= 0),
                CONSTRAINT "CK_stored_files_status" CHECK ("status" IN ('active','missing','deleted','pending','rejected'))
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stored_files_provider_object_key" ON "stored_files" ("provider", "objectKey")`);
        await queryRunner.query(`CREATE INDEX "IDX_stored_files_sha256" ON "stored_files" ("sha256")`);
        await queryRunner.query(`ALTER TABLE "stored_files" ADD CONSTRAINT "FK_stored_files_staff" FOREIGN KEY ("createdByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "stored_files" ADD CONSTRAINT "FK_stored_files_customer" FOREIGN KEY ("createdByCustomerId") REFERENCES "users"("id") ON DELETE SET NULL`);

        await queryRunner.query(`ALTER TABLE "registration_requests" ADD "equipmentPhotoFileId" integer`);
        await queryRunner.query(`ALTER TABLE "registration_requests" ADD "pdfFileId" integer`);
        await queryRunner.query(`ALTER TABLE "ticket_messages" ADD "storedFileId" integer`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD "invoiceStoredFileId" integer`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD "generatedConsentFileId" integer`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD "signedConsentFileId" integer`);
        await queryRunner.query(`ALTER TABLE "registration_requests" ADD CONSTRAINT "FK_registration_photo_file" FOREIGN KEY ("equipmentPhotoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "registration_requests" ADD CONSTRAINT "FK_registration_pdf_file" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_ticket_message_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_invoice_file" FOREIGN KEY ("invoiceStoredFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_generated_consent_file" FOREIGN KEY ("generatedConsentFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_signed_consent_file" FOREIGN KEY ("signedConsentFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_registration_photo_file" ON "registration_requests" ("equipmentPhotoFileId")`);
        await queryRunner.query(`CREATE INDEX "IDX_registration_pdf_file" ON "registration_requests" ("pdfFileId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ticket_message_file" ON "ticket_messages" ("storedFileId")`);
        await queryRunner.query(`CREATE INDEX "IDX_service_invoice_file" ON "service_requests" ("invoiceStoredFileId")`);

        await queryRunner.query(`
            CREATE TABLE "audit_events" (
                "id" BIGSERIAL NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "actorType" character varying NOT NULL,
                "actorStaffId" integer,
                "actorCustomerId" integer,
                "actorSessionId" integer,
                "action" character varying NOT NULL,
                "targetType" character varying NOT NULL,
                "targetId" character varying,
                "result" character varying NOT NULL,
                "reason" character varying,
                "requestId" uuid,
                "metadata" jsonb,
                CONSTRAINT "PK_audit_events" PRIMARY KEY ("id"),
                CONSTRAINT "CK_audit_events_actor_type" CHECK ("actorType" IN ('staff','customer','system')),
                CONSTRAINT "CK_audit_events_result" CHECK ("result" IN ('success','denied','failure'))
            )
        `);
        await queryRunner.query(`ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_staff" FOREIGN KEY ("actorStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_customer" FOREIGN KEY ("actorCustomerId") REFERENCES "users"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_session" FOREIGN KEY ("actorSessionId") REFERENCES "admin_sessions"("id") ON DELETE SET NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_created_at" ON "audit_events" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_actor_staff" ON "audit_events" ("actorStaffId")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_action" ON "audit_events" ("action")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_target" ON "audit_events" ("targetType", "targetId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "audit_events"`);
        await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN "signedConsentFileId"`);
        await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN "generatedConsentFileId"`);
        await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN "invoiceStoredFileId"`);
        await queryRunner.query(`ALTER TABLE "ticket_messages" DROP COLUMN "storedFileId"`);
        await queryRunner.query(`ALTER TABLE "registration_requests" DROP COLUMN "pdfFileId"`);
        await queryRunner.query(`ALTER TABLE "registration_requests" DROP COLUMN "equipmentPhotoFileId"`);
        await queryRunner.query(`DROP TABLE "stored_files"`);
    }
}
