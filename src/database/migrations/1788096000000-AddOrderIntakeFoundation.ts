import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderIntakeFoundation1788096000000
    implements MigrationInterface
{
    name = 'AddOrderIntakeFoundation1788096000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "audit_events" ADD "actorWebSessionId" integer`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_audit_events_actor_web_session" ON "audit_events" ("actorWebSessionId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_web_session" FOREIGN KEY ("actorWebSessionId") REFERENCES "customer_web_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );

        await queryRunner.query(
            `CREATE TABLE "orders" (
                "id" SERIAL NOT NULL,
                "createdByUserId" integer NOT NULL,
                "idempotencyKey" uuid NOT NULL,
                "submissionFingerprint" character(64) NOT NULL,
                "status" character varying(32) NOT NULL DEFAULT 'submitted',
                "version" integer NOT NULL,
                "customerType" character varying(32) NOT NULL,
                "organizationId" integer,
                "organizationNameSnapshot" character varying(300),
                "organizationInnSnapshot" character varying(12),
                "organizationKppSnapshot" character varying(9),
                "organizationOgrnSnapshot" character varying(15),
                "organizationLegalAddressSnapshot" character varying(500),
                "organizationActualAddressSnapshot" character varying(500),
                "organizationTaxSystemSnapshot" character varying(100),
                "contactNameSnapshot" character varying(160) NOT NULL,
                "contactPhoneSnapshot" character varying(30) NOT NULL,
                "contactEmailSnapshot" character varying(254),
                "deliveryType" character varying(32) NOT NULL,
                "deliveryCitySnapshot" character varying(160),
                "deliveryAddressSnapshot" character varying(500),
                "deliveryCommentSnapshot" character varying(1000),
                "customerComment" character varying(2000),
                "catalogPricedSubtotalMinor" numeric(20,0) NOT NULL,
                "hasUnpricedItems" boolean NOT NULL DEFAULT false,
                "currency" character(3) NOT NULL DEFAULT 'RUB',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_orders_status" CHECK ("status" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled')),
                CONSTRAINT "CK_orders_customer_type" CHECK ("customerType" IN ('organization','individual')),
                CONSTRAINT "CK_orders_delivery_type" CHECK ("deliveryType" IN ('pickup','courier','transport_company')),
                CONSTRAINT "CK_orders_currency" CHECK ("currency" = 'RUB'),
                CONSTRAINT "CK_orders_subtotal_nonnegative" CHECK ("catalogPricedSubtotalMinor" >= 0),
                CONSTRAINT "CK_orders_version_positive" CHECK ("version" > 0),
                CONSTRAINT "CK_orders_fingerprint" CHECK ("submissionFingerprint" ~ '^[0-9a-f]{64}$'),
                CONSTRAINT "CK_orders_contact_required" CHECK (btrim("contactNameSnapshot") <> '' AND btrim("contactPhoneSnapshot") <> ''),
                CONSTRAINT "CK_orders_customer_shape" CHECK (("customerType" = 'individual' AND "organizationId" IS NULL AND "organizationNameSnapshot" IS NULL AND "organizationInnSnapshot" IS NULL AND "organizationKppSnapshot" IS NULL AND "organizationOgrnSnapshot" IS NULL AND "organizationLegalAddressSnapshot" IS NULL AND "organizationActualAddressSnapshot" IS NULL AND "organizationTaxSystemSnapshot" IS NULL) OR ("customerType" = 'organization' AND "organizationNameSnapshot" IS NOT NULL AND btrim("organizationNameSnapshot") <> '' AND "organizationInnSnapshot" IS NOT NULL)),
                CONSTRAINT "CK_orders_organization_identifiers" CHECK (("organizationInnSnapshot" IS NULL OR "organizationInnSnapshot" ~ '^([0-9]{10}|[0-9]{12})$') AND ("organizationKppSnapshot" IS NULL OR "organizationKppSnapshot" ~ '^[0-9]{9}$') AND ("organizationOgrnSnapshot" IS NULL OR "organizationOgrnSnapshot" ~ '^([0-9]{13}|[0-9]{15})$')),
                CONSTRAINT "CK_orders_delivery_shape" CHECK (("deliveryType" = 'pickup') OR ("deliveryType" = 'courier' AND "deliveryCitySnapshot" IS NOT NULL AND btrim("deliveryCitySnapshot") <> '' AND "deliveryAddressSnapshot" IS NOT NULL AND btrim("deliveryAddressSnapshot") <> '') OR ("deliveryType" = 'transport_company' AND "deliveryCitySnapshot" IS NOT NULL AND btrim("deliveryCitySnapshot") <> '')),
                CONSTRAINT "PK_orders" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_orders_user_idempotency" ON "orders" ("createdByUserId", "idempotencyKey")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_user_created" ON "orders" ("createdByUserId", "createdAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_status_created" ON "orders" ("status", "createdAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_organization" ON "orders" ("organizationId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_organization_inn" ON "orders" ("organizationInnSnapshot")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_created" ON "orders" ("createdAt", "id")`,
        );

        await queryRunner.query(
            `CREATE TABLE "order_lines" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "productId" integer NOT NULL,
                "position" integer NOT NULL,
                "skuSnapshot" character varying(100) NOT NULL,
                "slugSnapshot" character varying(160) NOT NULL,
                "nameSnapshot" character varying(255) NOT NULL,
                "brandSnapshot" character varying(120),
                "catalogUnitPriceMinor" numeric(20,0),
                "vatRateSnapshot" smallint NOT NULL,
                "quantity" integer NOT NULL,
                "catalogLineTotalMinor" numeric(20,0),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_order_lines_quantity" CHECK ("quantity" > 0),
                CONSTRAINT "CK_order_lines_position" CHECK ("position" >= 0),
                CONSTRAINT "CK_order_lines_vat_rate" CHECK ("vatRateSnapshot" IN (0,500,700,1000,2000)),
                CONSTRAINT "CK_order_lines_money_shape" CHECK (("catalogUnitPriceMinor" IS NULL AND "catalogLineTotalMinor" IS NULL) OR ("catalogUnitPriceMinor" IS NOT NULL AND "catalogLineTotalMinor" IS NOT NULL AND "catalogUnitPriceMinor" >= 0 AND "catalogLineTotalMinor" >= 0 AND "catalogLineTotalMinor" = "catalogUnitPriceMinor" * "quantity")),
                CONSTRAINT "PK_order_lines" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_lines_order_product" ON "order_lines" ("orderId", "productId")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_lines_order_position" ON "order_lines" ("orderId", "position")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_lines_order" ON "order_lines" ("orderId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_lines_product" ON "order_lines" ("productId")`,
        );

        await queryRunner.query(
            `CREATE TABLE "order_events" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "type" character varying(40) NOT NULL,
                "fromStatus" character varying(32),
                "toStatus" character varying(32),
                "actorType" character varying(16) NOT NULL,
                "actorUserId" integer,
                "actorStaffId" integer,
                "visibility" character varying(16) NOT NULL,
                "message" character varying(2000),
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_order_events_type" CHECK ("type" IN ('submitted','review_started','quote_updated','confirmed','invoice_issued','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled')),
                CONSTRAINT "CK_order_events_statuses" CHECK (("fromStatus" IS NULL OR "fromStatus" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled')) AND ("toStatus" IS NULL OR "toStatus" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled'))),
                CONSTRAINT "CK_order_events_actor_type" CHECK ("actorType" IN ('customer','staff','system')),
                CONSTRAINT "CK_order_events_actor_identity" CHECK (("actorType" = 'customer' AND "actorUserId" IS NOT NULL AND "actorStaffId" IS NULL) OR ("actorType" = 'staff' AND "actorUserId" IS NULL AND "actorStaffId" IS NOT NULL) OR ("actorType" = 'system' AND "actorUserId" IS NULL AND "actorStaffId" IS NULL)),
                CONSTRAINT "CK_order_events_visibility" CHECK ("visibility" IN ('customer','staff')),
                CONSTRAINT "PK_order_events" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_events_order_created" ON "order_events" ("orderId", "createdAt", "id")`,
        );

        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_created_by_user" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_lines" ADD CONSTRAINT "FK_order_lines_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_lines" ADD CONSTRAINT "FK_order_lines_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_actor_user" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_actor_staff" FOREIGN KEY ("actorStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "FK_order_events_actor_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "FK_order_events_actor_user"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "FK_order_events_order"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_lines" DROP CONSTRAINT "FK_order_lines_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_lines" DROP CONSTRAINT "FK_order_lines_order"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_organization"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_created_by_user"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_order_events_order_created"`,
        );
        await queryRunner.query(`DROP TABLE "order_events"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_order_lines_product"`,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_order_lines_order"`);
        await queryRunner.query(
            `DROP INDEX "public"."UQ_order_lines_order_position"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_order_lines_order_product"`,
        );
        await queryRunner.query(`DROP TABLE "order_lines"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_created"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_organization_inn"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_organization"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_status_created"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_user_created"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_orders_user_idempotency"`,
        );
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(
            `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_audit_web_session"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_audit_events_actor_web_session"`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" DROP COLUMN "actorWebSessionId"`,
        );
    }
}
