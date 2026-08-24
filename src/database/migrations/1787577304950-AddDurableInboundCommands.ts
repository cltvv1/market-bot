import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurableInboundCommands1787577304950
    implements MigrationInterface
{
    name = 'AddDurableInboundCommands1787577304950';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "user_dialog_states" ("id" SERIAL NOT NULL, "platform" character varying NOT NULL, "chatId" text NOT NULL, "mode" character varying NOT NULL DEFAULT 'IDLE', "talkingTo" character varying, "serviceRequestId" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_user_dialog_states" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_user_dialog_states_platform_chat" ON "user_dialog_states" ("platform", "chatId")`,
        );

        await queryRunner.query(
            `CREATE TABLE "inbound_commands" ("id" SERIAL NOT NULL, "platform" character varying NOT NULL, "externalUpdateId" character varying(255) NOT NULL, "chatId" text NOT NULL, "userId" integer, "commandType" character varying(100) NOT NULL, "payload" jsonb, "status" character varying NOT NULL DEFAULT 'processing', "attemptCount" integer NOT NULL DEFAULT '1', "receivedAt" TIMESTAMP NOT NULL DEFAULT now(), "processingStartedAt" TIMESTAMP, "processedAt" TIMESTAMP, "error" text, "resultMetadata" jsonb, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_inbound_commands_status" CHECK ("status" IN ('processing', 'processed', 'failed')), CONSTRAINT "PK_inbound_commands" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "inbound_commands" ADD CONSTRAINT "FK_inbound_commands_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_inbound_commands_platform_external_update" ON "inbound_commands" ("platform", "externalUpdateId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_inbound_commands_dialog_received" ON "inbound_commands" ("platform", "chatId", "receivedAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_inbound_commands_status_received" ON "inbound_commands" ("status", "receivedAt")`,
        );

        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_service_requests_channel_active_draft" ON "service_requests" ("platform", "chatId", "serviceTypeCode") WHERE "status" = 'draft' AND "source" IN ('telegram', 'max')`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_registration_requests_active_draft" ON "registration_requests" ("platform", "chatId") WHERE "status" = 'draft'`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_tickets_active_client" ON "tickets" ("platform", "userChatId") WHERE "isAnswered" = false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."UQ_tickets_active_client"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_registration_requests_active_draft"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_service_requests_channel_active_draft"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_inbound_commands_status_received"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_inbound_commands_dialog_received"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_inbound_commands_platform_external_update"`,
        );
        await queryRunner.query(`DROP TABLE "inbound_commands"`);
        await queryRunner.query(
            `DROP INDEX "public"."UQ_user_dialog_states_platform_chat"`,
        );
        await queryRunner.query(`DROP TABLE "user_dialog_states"`);
    }
}
