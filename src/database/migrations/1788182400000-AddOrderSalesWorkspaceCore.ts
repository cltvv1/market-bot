import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderSalesWorkspaceCore1788182400000
    implements MigrationInterface
{
    name = 'AddOrderSalesWorkspaceCore1788182400000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "assignedManagerId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "assignedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "confirmedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_assigned_manager" ON "orders" ("assignedManagerId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_workspace" ON "orders" ("status", "assignedManagerId", "createdAt")`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_assigned_manager" FOREIGN KEY ("assignedManagerId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        await queryRunner.query(
            `CREATE TABLE "order_quotes" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'draft',
                "revision" integer NOT NULL DEFAULT 1,
                "catalogPricedSubtotalMinor" numeric(20,0) NOT NULL,
                "quotedPricedSubtotalMinor" numeric(20,0) NOT NULL,
                "hasUnpricedItems" boolean NOT NULL DEFAULT false,
                "currency" character(3) NOT NULL DEFAULT 'RUB',
                "internalComment" character varying(2000),
                "createdByStaffId" integer NOT NULL,
                "updatedByStaffId" integer NOT NULL,
                "confirmedByStaffId" integer,
                "confirmedAt" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_order_quotes_order" UNIQUE ("orderId"),
                CONSTRAINT "CK_order_quotes_status" CHECK ("status" IN ('draft','confirmed')),
                CONSTRAINT "CK_order_quotes_revision_positive" CHECK ("revision" > 0),
                CONSTRAINT "CK_order_quotes_currency" CHECK ("currency" = 'RUB'),
                CONSTRAINT "CK_order_quotes_money_nonnegative" CHECK ("catalogPricedSubtotalMinor" >= 0 AND "quotedPricedSubtotalMinor" >= 0),
                CONSTRAINT "CK_order_quotes_confirmation_shape" CHECK (("status" = 'draft' AND "confirmedByStaffId" IS NULL AND "confirmedAt" IS NULL) OR ("status" = 'confirmed' AND "confirmedByStaffId" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "hasUnpricedItems" = false)),
                CONSTRAINT "PK_order_quotes" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_quotes_status" ON "order_quotes" ("status")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_quotes_confirmed_at" ON "order_quotes" ("confirmedAt")`,
        );

        await queryRunner.query(
            `CREATE TABLE "order_quote_lines" (
                "id" SERIAL NOT NULL,
                "quoteId" integer NOT NULL,
                "productId" integer NOT NULL,
                "sourceOrderLineId" integer,
                "position" integer NOT NULL,
                "skuSnapshot" character varying(100) NOT NULL,
                "slugSnapshot" character varying(160) NOT NULL,
                "nameSnapshot" character varying(255) NOT NULL,
                "brandSnapshot" character varying(120),
                "catalogUnitPriceMinor" numeric(20,0),
                "quotedUnitPriceMinor" numeric(20,0),
                "vatRateSnapshot" smallint NOT NULL,
                "quantity" integer NOT NULL,
                "catalogLineTotalMinor" numeric(20,0),
                "quotedLineTotalMinor" numeric(20,0),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_order_quote_lines_quantity" CHECK ("quantity" > 0),
                CONSTRAINT "CK_order_quote_lines_position" CHECK ("position" >= 0),
                CONSTRAINT "CK_order_quote_lines_vat_rate" CHECK ("vatRateSnapshot" IN (0,500,700,1000,2000)),
                CONSTRAINT "CK_order_quote_lines_catalog_money_shape" CHECK (("catalogUnitPriceMinor" IS NULL AND "catalogLineTotalMinor" IS NULL) OR ("catalogUnitPriceMinor" IS NOT NULL AND "catalogLineTotalMinor" IS NOT NULL AND "catalogUnitPriceMinor" >= 0 AND "catalogLineTotalMinor" >= 0 AND "catalogLineTotalMinor" = "catalogUnitPriceMinor" * "quantity")),
                CONSTRAINT "CK_order_quote_lines_quoted_money_shape" CHECK (("quotedUnitPriceMinor" IS NULL AND "quotedLineTotalMinor" IS NULL) OR ("quotedUnitPriceMinor" IS NOT NULL AND "quotedLineTotalMinor" IS NOT NULL AND "quotedUnitPriceMinor" >= 0 AND "quotedLineTotalMinor" >= 0 AND "quotedLineTotalMinor" = "quotedUnitPriceMinor" * "quantity")),
                CONSTRAINT "PK_order_quote_lines" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_quote_lines_quote_product" ON "order_quote_lines" ("quoteId", "productId")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_quote_lines_quote_position" ON "order_quote_lines" ("quoteId", "position")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_quote_lines_quote_source" ON "order_quote_lines" ("quoteId", "sourceOrderLineId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_quote_lines_quote" ON "order_quote_lines" ("quoteId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_quote_lines_product" ON "order_quote_lines" ("productId")`,
        );

        await queryRunner.query(
            `ALTER TABLE "order_quotes" ADD CONSTRAINT "FK_order_quotes_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" ADD CONSTRAINT "FK_order_quotes_created_by_staff" FOREIGN KEY ("createdByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" ADD CONSTRAINT "FK_order_quotes_updated_by_staff" FOREIGN KEY ("updatedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" ADD CONSTRAINT "FK_order_quotes_confirmed_by_staff" FOREIGN KEY ("confirmedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" ADD CONSTRAINT "FK_order_quote_lines_quote" FOREIGN KEY ("quoteId") REFERENCES "order_quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" ADD CONSTRAINT "FK_order_quote_lines_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" ADD CONSTRAINT "FK_order_quote_lines_source_order_line" FOREIGN KEY ("sourceOrderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "CK_order_events_type"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "CK_order_events_type" CHECK ("type" IN ('submitted','manager_assigned','manager_reassigned','review_started','quote_updated','confirmed','invoice_issued','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled'))`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "CK_order_events_type"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "CK_order_events_type" CHECK ("type" IN ('submitted','review_started','quote_updated','confirmed','invoice_issued','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled'))`,
        );

        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" DROP CONSTRAINT "FK_order_quote_lines_source_order_line"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" DROP CONSTRAINT "FK_order_quote_lines_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quote_lines" DROP CONSTRAINT "FK_order_quote_lines_quote"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" DROP CONSTRAINT "FK_order_quotes_confirmed_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" DROP CONSTRAINT "FK_order_quotes_updated_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" DROP CONSTRAINT "FK_order_quotes_created_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_quotes" DROP CONSTRAINT "FK_order_quotes_order"`,
        );
        await queryRunner.query(`DROP TABLE "order_quote_lines"`);
        await queryRunner.query(`DROP TABLE "order_quotes"`);

        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_assigned_manager"`,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_workspace"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_assigned_manager"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "confirmedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "assignedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "assignedManagerId"`,
        );
    }
}
