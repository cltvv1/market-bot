import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthorizeStaffNotifications1787750400000
    implements MigrationInterface
{
    name = 'AuthorizeStaffNotifications1787750400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyRegistrations" SET DEFAULT false`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyTickets" SET DEFAULT false`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyServiceRequests" SET DEFAULT false`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" ADD "recipientStaffId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "CK_outbound_deliveries_customer_staff_identity" CHECK ("audience" = 'staff' OR "recipientStaffId" IS NULL)`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "FK_outbound_deliveries_recipient_staff" FOREIGN KEY ("recipientStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_outbound_deliveries_recipient_staff" ON "outbound_deliveries" ("recipientStaffId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_outbound_deliveries_recipient_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" DROP CONSTRAINT "FK_outbound_deliveries_recipient_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" DROP CONSTRAINT "CK_outbound_deliveries_customer_staff_identity"`,
        );
        await queryRunner.query(
            `ALTER TABLE "outbound_deliveries" DROP COLUMN "recipientStaffId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyServiceRequests" SET DEFAULT true`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyTickets" SET DEFAULT true`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" ALTER COLUMN "notifyRegistrations" SET DEFAULT true`,
        );
    }
}
