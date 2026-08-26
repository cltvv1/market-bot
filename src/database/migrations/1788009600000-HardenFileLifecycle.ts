import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenFileLifecycle1788009600000 implements MigrationInterface {
    name = 'HardenFileLifecycle1788009600000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "deletedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "missingAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "lastVerifiedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "corruptAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "purgeAfter" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD "purgedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP CONSTRAINT "CK_stored_files_status"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD CONSTRAINT "CK_stored_files_status" CHECK ("status" IN ('active','missing','corrupt','deleted','pending','rejected'))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_stored_files_lifecycle" ON "stored_files" ("status", "purgeAfter")`,
        );
        await queryRunner.query(
            `UPDATE "stored_files"
             SET "deletedAt" = COALESCE("updatedAt", now()),
                 "purgeAfter" = now() + interval '24 hours'
             WHERE "status" IN ('deleted', 'rejected')`,
        );
        await queryRunner.query(
            `UPDATE "stored_files"
             SET "missingAt" = COALESCE("updatedAt", now())
             WHERE "status" = 'missing'`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "stored_files" SET "status" = 'missing' WHERE "status" = 'corrupt'`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_stored_files_lifecycle"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP CONSTRAINT "CK_stored_files_status"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD CONSTRAINT "CK_stored_files_status" CHECK ("status" IN ('active','missing','deleted','pending','rejected'))`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "purgedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "purgeAfter"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "corruptAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "lastVerifiedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "missingAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP COLUMN "deletedAt"`,
        );
    }
}
