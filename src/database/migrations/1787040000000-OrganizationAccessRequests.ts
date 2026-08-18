import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationAccessRequests1787040000000
    implements MigrationInterface
{
    name = 'OrganizationAccessRequests1787040000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "organization_access_requests" (
            "id" SERIAL NOT NULL,
            "organizationId" integer NOT NULL,
            "userId" integer NOT NULL,
            "status" character varying NOT NULL DEFAULT 'pending',
            "requestedRole" character varying NOT NULL DEFAULT 'representative',
            "submittedName" character varying,
            "submittedPhone" character varying,
            "submittedEmail" character varying,
            "comment" character varying,
            "reviewedByStaffId" integer,
            "reviewComment" character varying,
            "reviewedAt" TIMESTAMP,
            "cancelledAt" TIMESTAMP,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "CK_org_access_request_status" CHECK ("status" IN ('pending','approved','rejected','cancelled')),
            CONSTRAINT "CK_org_access_request_role" CHECK ("requestedRole" = 'representative'),
            CONSTRAINT "FK_org_access_request_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_org_access_request_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_org_access_request_reviewer" FOREIGN KEY ("reviewedByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL,
            CONSTRAINT "PK_organization_access_requests" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(
            `CREATE INDEX "IDX_org_access_request_user_created" ON "organization_access_requests" ("userId", "createdAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_org_access_request_status_created" ON "organization_access_requests" ("status", "createdAt")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_org_access_request_pending" ON "organization_access_requests" ("organizationId", "userId") WHERE "status" = 'pending'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."UQ_org_access_request_pending"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_org_access_request_status_created"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_org_access_request_user_created"`,
        );
        await queryRunner.query(`DROP TABLE "organization_access_requests"`);
    }
}
