import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationFoundation1786953600000 implements MigrationInterface {
    name = 'IntegrationFoundation1786953600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "cash_registers" ADD "installationAddress" character varying`,
        );
        await queryRunner.query(`CREATE TABLE "integration_runs" (
            "id" BIGSERIAL NOT NULL,
            "provider" character varying NOT NULL,
            "kind" character varying NOT NULL,
            "mode" character varying NOT NULL DEFAULT 'shadow',
            "status" character varying NOT NULL DEFAULT 'running',
            "receivedCount" integer NOT NULL DEFAULT 0,
            "appliedCount" integer NOT NULL DEFAULT 0,
            "skippedCount" integer NOT NULL DEFAULT 0,
            "errorCount" integer NOT NULL DEFAULT 0,
            "checkpoint" jsonb,
            "errorSummary" text,
            "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "finishedAt" TIMESTAMP,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_integration_runs_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "CK_integration_runs_mode" CHECK ("mode" IN ('shadow','apply')),
            CONSTRAINT "CK_integration_runs_status" CHECK ("status" IN ('running','succeeded','partial','failed')),
            CONSTRAINT "PK_integration_runs" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_runs_provider_created" ON "integration_runs" ("provider", "createdAt")`,
        );

        await queryRunner.query(`CREATE TABLE "integration_errors" (
            "id" BIGSERIAL NOT NULL,
            "integrationRunId" bigint NOT NULL,
            "provider" character varying NOT NULL,
            "entityType" character varying,
            "externalId" character varying,
            "code" character varying NOT NULL,
            "message" text NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_integration_errors_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "FK_integration_error_run" FOREIGN KEY ("integrationRunId") REFERENCES "integration_runs"("id") ON DELETE CASCADE,
            CONSTRAINT "PK_integration_errors" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_errors_run" ON "integration_errors" ("integrationRunId", "createdAt")`,
        );

        await queryRunner.query(`CREATE TABLE "integration_exclusions" (
            "id" SERIAL NOT NULL,
            "inn" character varying NOT NULL,
            "provider" character varying,
            "observationType" character varying,
            "reason" text,
            "isActive" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_integration_exclusions_provider" CHECK ("provider" IS NULL OR "provider" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "PK_integration_exclusions" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_exclusions_match" ON "integration_exclusions" ("inn", "provider", "observationType", "isActive")`,
        );

        await queryRunner.query(`CREATE TABLE "external_mappings" (
            "id" BIGSERIAL NOT NULL,
            "provider" character varying NOT NULL,
            "entityType" character varying NOT NULL,
            "externalId" character varying NOT NULL,
            "localId" integer NOT NULL,
            "externalRevision" character varying,
            "metadata" jsonb,
            "lastSeenAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_external_mappings_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "UQ_external_mapping_provider_entity_id" UNIQUE ("provider", "entityType", "externalId"),
            CONSTRAINT "PK_external_mappings" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_external_mapping_local" ON "external_mappings" ("entityType", "localId")`,
        );

        await queryRunner.query(`CREATE TABLE "organization_contacts" (
            "id" SERIAL NOT NULL,
            "organizationId" integer NOT NULL,
            "kind" character varying NOT NULL,
            "rawValue" character varying NOT NULL,
            "normalizedValue" character varying,
            "source" character varying NOT NULL,
            "externalId" character varying,
            "quality" character varying,
            "isActive" boolean NOT NULL DEFAULT true,
            "lastSeenAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_organization_contacts_kind" CHECK ("kind" IN ('phone','email')),
            CONSTRAINT "CK_organization_contacts_source" CHECK ("source" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "FK_organization_contacts_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
            CONSTRAINT "PK_organization_contacts" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_organization_contacts_organization" ON "organization_contacts" ("organizationId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_organization_contacts_normalized" ON "organization_contacts" ("kind", "normalizedValue")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_organization_contacts_external" ON "organization_contacts" ("source", "externalId") WHERE "externalId" IS NOT NULL`,
        );

        await queryRunner.query(`CREATE TABLE "external_observations" (
            "id" BIGSERIAL NOT NULL,
            "provider" character varying NOT NULL,
            "externalKey" character varying NOT NULL,
            "integrationRunId" bigint,
            "organizationId" integer,
            "cashRegisterId" integer,
            "kind" character varying NOT NULL,
            "severity" character varying NOT NULL DEFAULT 'normal',
            "title" character varying NOT NULL,
            "description" text,
            "status" character varying NOT NULL DEFAULT 'active',
            "fingerprint" character varying NOT NULL,
            "metadata" jsonb,
            "occurredAt" TIMESTAMP NOT NULL,
            "lastSeenAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_external_observations_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')),
            CONSTRAINT "CK_external_observations_severity" CHECK ("severity" IN ('info','low','normal','high','urgent')),
            CONSTRAINT "CK_external_observations_status" CHECK ("status" IN ('active','resolved')),
            CONSTRAINT "UQ_external_observation_provider_key" UNIQUE ("provider", "externalKey"),
            CONSTRAINT "FK_external_observation_run" FOREIGN KEY ("integrationRunId") REFERENCES "integration_runs"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_external_observation_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_external_observation_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL,
            CONSTRAINT "PK_external_observations" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_external_observations_subject" ON "external_observations" ("organizationId", "cashRegisterId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_external_observations_status_seen" ON "external_observations" ("status", "lastSeenAt")`,
        );

        await queryRunner.query(`CREATE TABLE "service_opportunities" (
            "id" SERIAL NOT NULL,
            "identityKey" character varying NOT NULL,
            "organizationId" integer,
            "cashRegisterId" integer,
            "type" character varying NOT NULL,
            "title" character varying NOT NULL,
            "description" text,
            "priority" character varying NOT NULL DEFAULT 'normal',
            "status" character varying NOT NULL DEFAULT 'new',
            "assignedAdminId" integer,
            "serviceRequestId" integer,
            "firstSeenAt" TIMESTAMP NOT NULL,
            "lastSeenAt" TIMESTAMP NOT NULL,
            "callbackAt" TIMESTAMP,
            "resolvedAt" TIMESTAMP,
            "operatorComment" text,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_service_opportunities_priority" CHECK ("priority" IN ('low','normal','high','urgent')),
            CONSTRAINT "CK_service_opportunities_status" CHECK ("status" IN ('new','in_progress','contact_later','converted','resolved','not_relevant')),
            CONSTRAINT "UQ_service_opportunity_identity" UNIQUE ("identityKey"),
            CONSTRAINT "FK_service_opportunity_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_service_opportunity_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_service_opportunity_admin" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_service_opportunity_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL,
            CONSTRAINT "PK_service_opportunities" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_service_opportunities_status_seen" ON "service_opportunities" ("status", "lastSeenAt")`,
        );

        await queryRunner.query(`CREATE TABLE "opportunity_observations" (
            "opportunityId" integer NOT NULL,
            "observationId" bigint NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "FK_opportunity_observations_opportunity" FOREIGN KEY ("opportunityId") REFERENCES "service_opportunities"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_opportunity_observations_observation" FOREIGN KEY ("observationId") REFERENCES "external_observations"("id") ON DELETE CASCADE,
            CONSTRAINT "PK_opportunity_observations" PRIMARY KEY ("opportunityId", "observationId")
        )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "opportunity_observations"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_opportunities_status_seen"`,
        );
        await queryRunner.query(`DROP TABLE "service_opportunities"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_observations_status_seen"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_observations_subject"`,
        );
        await queryRunner.query(`DROP TABLE "external_observations"`);
        await queryRunner.query(
            `DROP INDEX "public"."UQ_organization_contacts_external"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_organization_contacts_normalized"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_organization_contacts_organization"`,
        );
        await queryRunner.query(`DROP TABLE "organization_contacts"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_mapping_local"`,
        );
        await queryRunner.query(`DROP TABLE "external_mappings"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_exclusions_match"`,
        );
        await queryRunner.query(`DROP TABLE "integration_exclusions"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_errors_run"`,
        );
        await queryRunner.query(`DROP TABLE "integration_errors"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_runs_provider_created"`,
        );
        await queryRunner.query(`DROP TABLE "integration_runs"`);
        await queryRunner.query(
            `ALTER TABLE "cash_registers" DROP COLUMN "installationAddress"`,
        );
    }
}
