import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecurityFoundation1785079000000 implements MigrationInterface {
    name = 'SecurityFoundation1785079000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "admin_user_roles" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "role" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_admin_user_roles_user_role" UNIQUE ("userId", "role"), CONSTRAINT "PK_admin_user_roles" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_user_roles" ADD CONSTRAINT "FK_admin_user_roles_user" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_user_roles_role" ON "admin_user_roles" ("role")`,
        );
        await queryRunner.query(
            `INSERT INTO "admin_user_roles" ("userId", "role")
             SELECT "id", CASE WHEN "role" = 'admin' THEN 'superadmin' ELSE 'operator' END
             FROM "admin_users"
             WHERE "role" IN ('admin', 'operator')
             ON CONFLICT ("userId", "role") DO NOTHING`,
        );

        await queryRunner.query(
            `ALTER TABLE "admin_users" ADD "lastLoginAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" ADD "lastUsedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" ADD "revokedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_sessions_user" ON "admin_sessions" ("userId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_sessions_expiry_active" ON "admin_sessions" ("expiresAt", "revokedAt")`,
        );

        await queryRunner.query(
            `CREATE TABLE "customer_web_sessions" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "lastUsedAt" TIMESTAMP, "revokedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_customer_web_sessions_token" UNIQUE ("tokenHash"), CONSTRAINT "PK_customer_web_sessions" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_web_sessions" ADD CONSTRAINT "FK_customer_web_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_web_sessions_user" ON "customer_web_sessions" ("userId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_web_sessions_expiry_active" ON "customer_web_sessions" ("expiresAt", "revokedAt")`,
        );

        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "assignedEngineerId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_assigned_engineer" FOREIGN KEY ("assignedEngineerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_assigned_engineer" ON "service_requests" ("assignedEngineerId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Destructive for new security metadata; use only on disposable development/test databases.
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_assigned_engineer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_assigned_engineer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP COLUMN "assignedEngineerId"`,
        );
        await queryRunner.query(
            `DROP TABLE "customer_web_sessions"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_admin_sessions_expiry_active"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_admin_sessions_user"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" DROP COLUMN "revokedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" DROP COLUMN "lastUsedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_users" DROP COLUMN "lastLoginAt"`,
        );
        await queryRunner.query(
            `DROP TABLE "admin_user_roles"`,
        );
    }
}
