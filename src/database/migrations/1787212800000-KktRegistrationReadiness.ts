import { MigrationInterface, QueryRunner } from 'typeorm';

export class KktRegistrationReadiness1787212800000
    implements MigrationInterface
{
    name = 'KktRegistrationReadiness1787212800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD "ofdProvisionMode" character varying NOT NULL DEFAULT 'clarification_required'`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD "readiness" character varying NOT NULL DEFAULT 'incomplete'`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD "readinessUpdatedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD "assignedEngineerId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD "handedOffAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD CONSTRAINT "FK_registration_assigned_engineer" FOREIGN KEY ("assignedEngineerId") REFERENCES "admin_users"("id") ON DELETE SET NULL`,
        );

        await queryRunner.query(`CREATE TABLE "registration_requirements" (
            "id" SERIAL NOT NULL,
            "registrationId" integer NOT NULL,
            "kind" character varying NOT NULL,
            "status" character varying NOT NULL DEFAULT 'missing',
            "value" text,
            "source" character varying,
            "requestedAt" TIMESTAMP,
            "providedAt" TIMESTAMP,
            "verifiedAt" TIMESTAMP,
            "verifiedByStaffId" integer,
            "notRequiredReason" text,
            "operatorComment" text,
            "metadata" jsonb,
            "version" integer NOT NULL DEFAULT 1,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_registration_requirement_kind" CHECK ("kind" IN ('kkt_serial','fiscal_drive_serial','ofd_code')),
            CONSTRAINT "CK_registration_requirement_status" CHECK ("status" IN ('missing','requested','provided','verified','not_required')),
            CONSTRAINT "CK_registration_requirement_source" CHECK ("source" IS NULL OR "source" IN ('internal_registry','customer_input','customer_photo','sold_by_vitma','operator_input','external_system','legacy')),
            CONSTRAINT "UQ_registration_requirement_kind" UNIQUE ("registrationId", "kind"),
            CONSTRAINT "PK_registration_requirements" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_registration_requirements_status" ON "registration_requirements" ("status")`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" ALTER COLUMN "version" DROP DEFAULT`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" ADD CONSTRAINT "FK_registration_requirement_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" ADD CONSTRAINT "FK_registration_requirement_verifier" FOREIGN KEY ("verifiedByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL`,
        );

        await queryRunner.query(`CREATE TABLE "registration_evidence" (
            "id" SERIAL NOT NULL,
            "registrationId" integer NOT NULL,
            "requirementId" integer,
            "storedFileId" integer NOT NULL,
            "kind" character varying NOT NULL,
            "visibility" character varying NOT NULL DEFAULT 'staff',
            "uploadedByActorType" character varying NOT NULL,
            "uploadedByActorId" integer,
            "comment" text,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "removedAt" TIMESTAMP,
            CONSTRAINT "CK_registration_evidence_kind" CHECK ("kind" IN ('customer_photo','customer_document','internal_registry','legacy_photo')),
            CONSTRAINT "CK_registration_evidence_visibility" CHECK ("visibility" IN ('customer','staff','engineer')),
            CONSTRAINT "CK_registration_evidence_actor" CHECK ("uploadedByActorType" IN ('customer','staff','system')),
            CONSTRAINT "UQ_registration_evidence_link" UNIQUE ("requirementId", "storedFileId"),
            CONSTRAINT "PK_registration_evidence" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_registration_evidence_registration" ON "registration_evidence" ("registrationId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_requirement" FOREIGN KEY ("requirementId") REFERENCES "registration_requirements"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT`,
        );

        await queryRunner.query(`CREATE TABLE "registration_data_requests" (
            "id" SERIAL NOT NULL,
            "registrationId" integer NOT NULL,
            "requirementId" integer NOT NULL,
            "requestedByStaffId" integer NOT NULL,
            "requestText" text NOT NULL,
            "targetChannel" character varying NOT NULL,
            "responseToken" uuid NOT NULL,
            "status" character varying NOT NULL DEFAULT 'open',
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "deliveredAt" TIMESTAMP,
            "deliveryError" text,
            "activatedAt" TIMESTAMP,
            "answeredAt" TIMESTAMP,
            "closedAt" TIMESTAMP,
            CONSTRAINT "CK_registration_data_request_status" CHECK ("status" IN ('open','delivered','delivery_failed','answered','closed')),
            CONSTRAINT "PK_registration_data_requests" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_registration_data_request_token" ON "registration_data_requests" ("responseToken")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_registration_data_request_open" ON "registration_data_requests" ("requirementId") WHERE "closedAt" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_requirement" FOREIGN KEY ("requirementId") REFERENCES "registration_requirements"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_staff" FOREIGN KEY ("requestedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT`,
        );

        await queryRunner.query(`
            INSERT INTO "registration_requirements" ("registrationId", "kind", "status", "value", "source", "providedAt", "verifiedAt", "notRequiredReason", "metadata", "version")
            SELECT r.id, kinds.kind,
                CASE
                    WHEN r."isProcessed" OR r."isStopped" THEN CASE WHEN values.value IS NULL THEN 'not_required' ELSE 'verified' END
                    WHEN values.value IS NULL THEN 'missing'
                    ELSE 'provided'
                END,
                values.value,
                CASE WHEN values.value IS NULL THEN NULL WHEN values.from_kit THEN 'internal_registry' ELSE 'legacy' END,
                CASE WHEN values.value IS NULL THEN NULL ELSE r."updatedAt" END,
                CASE WHEN (r."isProcessed" OR r."isStopped") AND values.value IS NOT NULL THEN r."updatedAt" ELSE NULL END,
                CASE WHEN (r."isProcessed" OR r."isStopped") AND values.value IS NULL THEN 'Historical finalized registration backfill' ELSE NULL END,
                jsonb_build_object('backfilled', true),
                1
            FROM "registration_requests" r
            CROSS JOIN (VALUES ('kkt_serial'), ('fiscal_drive_serial'), ('ofd_code')) AS kinds(kind)
            LEFT JOIN "equipment_kits" kit ON kit.id = r."equipmentKitId"
            CROSS JOIN LATERAL (
                SELECT
                    CASE kinds.kind
                        WHEN 'kkt_serial' THEN NULLIF(trim(kit."cashRegisterSerial"), '')
                        WHEN 'fiscal_drive_serial' THEN NULLIF(trim(kit."fiscalDriveSerial"), '')
                        WHEN 'ofd_code' THEN NULLIF(trim(kit."ofdActivationCode"), '')
                    END AS value,
                    kit.id IS NOT NULL AS from_kit
            ) values
            ON CONFLICT ("registrationId", "kind") DO NOTHING
        `);
        await queryRunner.query(`
            INSERT INTO "registration_evidence" ("registrationId", "requirementId", "storedFileId", "kind", "visibility", "uploadedByActorType", "uploadedByActorId", "comment")
            SELECT r.id, NULL, r."equipmentPhotoFileId", 'legacy_photo', 'staff', 'customer', r."userId", 'Legacy general equipment photo; item purpose is unknown'
            FROM "registration_requests" r
            WHERE r."equipmentPhotoFileId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "registration_evidence" e WHERE e."registrationId" = r.id AND e."storedFileId" = r."equipmentPhotoFileId")
        `);
        await queryRunner.query(`UPDATE "registration_requests" SET
            "ofdProvisionMode" = CASE WHEN "isProcessed" OR "isStopped" THEN 'not_applicable' ELSE 'clarification_required' END,
            "readiness" = CASE WHEN "isProcessed" OR "isStopped" THEN 'ready' ELSE 'incomplete' END,
            "readinessUpdatedAt" = now(),
            "handedOffAt" = CASE WHEN "isProcessed" THEN "updatedAt" ELSE NULL END`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "registration_data_requests"`);
        await queryRunner.query(`DROP TABLE "registration_evidence"`);
        await queryRunner.query(`DROP TABLE "registration_requirements"`);
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP CONSTRAINT "FK_registration_assigned_engineer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP COLUMN "handedOffAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP COLUMN "assignedEngineerId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP COLUMN "readinessUpdatedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP COLUMN "readiness"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP COLUMN "ofdProvisionMode"`,
        );
    }
}
