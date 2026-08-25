import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurableOutboundDeliveries1787664000000
    implements MigrationInterface
{
    name = 'AddDurableOutboundDeliveries1787664000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "outbound_deliveries" ("id" SERIAL NOT NULL, "dedupeKey" character varying(255) NOT NULL, "platform" character varying NOT NULL, "recipientChatId" text NOT NULL, "kind" character varying(20) NOT NULL, "audience" character varying(20) NOT NULL, "sourceType" character varying(100) NOT NULL, "sourceId" character varying(100) NOT NULL, "payload" jsonb NOT NULL, "storedFileId" integer, "status" character varying(20) NOT NULL DEFAULT 'pending', "attemptCount" integer NOT NULL DEFAULT '0', "nextAttemptAt" TIMESTAMP NOT NULL DEFAULT now(), "lastAttemptAt" TIMESTAMP, "claimedAt" TIMESTAMP, "claimToken" uuid, "sentAt" TIMESTAMP, "providerMessageId" character varying(255), "lastError" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_outbound_deliveries_status" CHECK ("status" IN ('pending','processing','retrying','sent','failed')), CONSTRAINT "CK_outbound_deliveries_platform" CHECK ("platform" IN ('telegram','max')), CONSTRAINT "CK_outbound_deliveries_kind" CHECK ("kind" IN ('text','document','image')), CONSTRAINT "CK_outbound_deliveries_audience" CHECK ("audience" IN ('customer','staff')), CONSTRAINT "CK_outbound_deliveries_file_kind" CHECK (("kind" = 'text' AND "storedFileId" IS NULL) OR ("kind" IN ('document','image') AND "storedFileId" IS NOT NULL)), CONSTRAINT "CK_outbound_deliveries_attempt_count" CHECK ("attemptCount" >= 0), CONSTRAINT "PK_outbound_deliveries" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "FK_outbound_deliveries_stored_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_outbound_deliveries_dedupe_key" ON "outbound_deliveries" ("dedupeKey")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_outbound_deliveries_eligible" ON "outbound_deliveries" ("status", "nextAttemptAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_outbound_deliveries_source" ON "outbound_deliveries" ("sourceType", "sourceId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_outbound_deliveries_source"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_outbound_deliveries_eligible"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_outbound_deliveries_dedupe_key"`,
        );
        await queryRunner.query(`DROP TABLE "outbound_deliveries"`);
    }
}
