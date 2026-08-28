import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderInvoicePaymentWorkflow1788268800000
    implements MigrationInterface
{
    name = 'AddOrderInvoicePaymentWorkflow1788268800000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "invoiceIssuedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "paymentReceivedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "paymentConfirmedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "paymentConfirmedByStaffId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "paymentConfirmationSource" character varying(32)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "paymentConfirmationComment" character varying(1000)`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_invoice_issued_at" ON "orders" ("invoiceIssuedAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_payment_confirmed_at" ON "orders" ("paymentConfirmedAt")`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_payment_source" CHECK ("paymentConfirmationSource" IS NULL OR "paymentConfirmationSource" IN ('bank_statement','payment_order','customer_confirmation','other'))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_payment_confirmation_shape" CHECK (("paymentReceivedAt" IS NULL AND "paymentConfirmedAt" IS NULL AND "paymentConfirmedByStaffId" IS NULL AND "paymentConfirmationSource" IS NULL AND "paymentConfirmationComment" IS NULL) OR ("paymentReceivedAt" IS NOT NULL AND "paymentConfirmedAt" IS NOT NULL AND "paymentConfirmedByStaffId" IS NOT NULL AND "paymentConfirmationSource" IS NOT NULL))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_payment_confirmed_by_staff" FOREIGN KEY ("paymentConfirmedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        await queryRunner.query(
            `CREATE TABLE "order_documents" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "type" character varying(32) NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'active',
                "revision" integer NOT NULL,
                "storedFileId" integer NOT NULL,
                "customerVisible" boolean NOT NULL DEFAULT true,
                "uploadedByStaffId" integer,
                "uploadedByCustomerId" integer,
                "quoteRevisionSnapshot" integer,
                "amountMinorSnapshot" numeric(20,0),
                "currency" character(3),
                "supersededAt" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "CK_order_documents_type" CHECK ("type" IN ('invoice','payment_proof')),
                CONSTRAINT "CK_order_documents_status" CHECK ("status" IN ('active','superseded')),
                CONSTRAINT "CK_order_documents_revision_positive" CHECK ("revision" > 0),
                CONSTRAINT "CK_order_documents_actor_shape" CHECK (("type" = 'invoice' AND "uploadedByStaffId" IS NOT NULL AND "uploadedByCustomerId" IS NULL) OR ("type" = 'payment_proof' AND "uploadedByStaffId" IS NULL AND "uploadedByCustomerId" IS NOT NULL)),
                CONSTRAINT "CK_order_documents_status_shape" CHECK (("status" = 'active' AND "supersededAt" IS NULL) OR ("status" = 'superseded' AND "supersededAt" IS NOT NULL)),
                CONSTRAINT "CK_order_documents_payment_proof_active" CHECK ("type" <> 'payment_proof' OR "status" = 'active'),
                CONSTRAINT "CK_order_documents_commercial_shape" CHECK (("type" = 'invoice' AND "quoteRevisionSnapshot" IS NOT NULL AND "quoteRevisionSnapshot" > 0 AND "amountMinorSnapshot" IS NOT NULL AND "amountMinorSnapshot" >= 0 AND "currency" = 'RUB') OR ("type" = 'payment_proof' AND "quoteRevisionSnapshot" IS NULL AND "amountMinorSnapshot" IS NULL AND "currency" IS NULL)),
                CONSTRAINT "PK_order_documents" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_documents_order_type_revision" ON "order_documents" ("orderId", "type", "revision")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_documents_stored_file" ON "order_documents" ("storedFileId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_documents_order_created" ON "order_documents" ("orderId", "createdAt", "id")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_order_documents_order_type" ON "order_documents" ("orderId", "type")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_order_documents_active_invoice" ON "order_documents" ("orderId") WHERE "type" = 'invoice' AND "status" = 'active'`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "FK_order_documents_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "FK_order_documents_stored_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "FK_order_documents_uploaded_by_staff" FOREIGN KEY ("uploadedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "FK_order_documents_uploaded_by_customer" FOREIGN KEY ("uploadedByCustomerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "CK_order_events_type"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "CK_order_events_type" CHECK ("type" IN ('submitted','manager_assigned','manager_reassigned','review_started','quote_updated','confirmed','invoice_issued','invoice_replaced','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled'))`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_events" DROP CONSTRAINT "CK_order_events_type"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_events" ADD CONSTRAINT "CK_order_events_type" CHECK ("type" IN ('submitted','manager_assigned','manager_reassigned','review_started','quote_updated','confirmed','invoice_issued','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled'))`,
        );

        await queryRunner.query(
            `ALTER TABLE "order_documents" DROP CONSTRAINT "FK_order_documents_uploaded_by_customer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" DROP CONSTRAINT "FK_order_documents_uploaded_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" DROP CONSTRAINT "FK_order_documents_stored_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_documents" DROP CONSTRAINT "FK_order_documents_order"`,
        );
        await queryRunner.query(`DROP TABLE "order_documents"`);

        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_payment_confirmed_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_payment_confirmation_shape"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_payment_source"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_payment_confirmed_at"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_invoice_issued_at"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "paymentConfirmationComment"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "paymentConfirmationSource"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "paymentConfirmedByStaffId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "paymentConfirmedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "paymentReceivedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "invoiceIssuedAt"`,
        );
    }
}
