import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderFulfillmentCompletionWorkflow1788355200000
    implements MigrationInterface
{
    name = 'AddOrderFulfillmentCompletionWorkflow1788355200000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfilledAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfilledByStaffId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfillmentMethod" character varying(32)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfillmentRecipientName" character varying(160)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfillmentCarrierName" character varying(160)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfillmentTrackingNumber" character varying(160)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "fulfillmentComment" character varying(1000)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "completedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "completedByStaffId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "realizationNumber" character varying(100)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "realizationDate" date`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "finalDocumentsDeliveryMethod" character varying(32)`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "finalDocumentKinds" character varying array`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "finalDocumentsDeliveredAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD "completionComment" character varying(1000)`,
        );

        await queryRunner.query(
            `CREATE INDEX "IDX_orders_fulfilled_at" ON "orders" ("fulfilledAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_completed_at" ON "orders" ("completedAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_orders_realization_number" ON "orders" ("realizationNumber")`,
        );

        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_fulfillment_method" CHECK ("fulfillmentMethod" IS NULL OR "fulfillmentMethod" IN ('pickup','courier','transport_company','service_only','mixed'))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_fulfillment_shape" CHECK (("fulfilledAt" IS NULL AND "fulfilledByStaffId" IS NULL AND "fulfillmentMethod" IS NULL AND "fulfillmentRecipientName" IS NULL AND "fulfillmentCarrierName" IS NULL AND "fulfillmentTrackingNumber" IS NULL AND "fulfillmentComment" IS NULL) OR ("fulfilledAt" IS NOT NULL AND "fulfilledByStaffId" IS NOT NULL AND "fulfillmentMethod" IS NOT NULL))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_fulfillment_optional_strings" CHECK (("fulfillmentRecipientName" IS NULL OR btrim("fulfillmentRecipientName") <> '') AND ("fulfillmentCarrierName" IS NULL OR btrim("fulfillmentCarrierName") <> '') AND ("fulfillmentTrackingNumber" IS NULL OR btrim("fulfillmentTrackingNumber") <> '') AND ("fulfillmentComment" IS NULL OR btrim("fulfillmentComment") <> ''))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_fulfillment_conditions" CHECK (("fulfillmentMethod" <> 'transport_company' OR ("fulfillmentCarrierName" IS NOT NULL AND btrim("fulfillmentCarrierName") <> '')) AND ("fulfillmentMethod" <> 'service_only' OR ("fulfillmentComment" IS NOT NULL AND btrim("fulfillmentComment") <> '' AND "fulfillmentCarrierName" IS NULL AND "fulfillmentTrackingNumber" IS NULL)) AND ("fulfillmentMethod" <> 'mixed' OR ("fulfillmentComment" IS NOT NULL AND btrim("fulfillmentComment") <> '')))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_final_documents_delivery_method" CHECK ("finalDocumentsDeliveryMethod" IS NULL OR "finalDocumentsDeliveryMethod" IN ('edo','paper','mixed','not_required'))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_final_document_kinds" CHECK ("finalDocumentKinds" IS NULL OR (cardinality("finalDocumentKinds") <= 5 AND "finalDocumentKinds" <@ ARRAY['upd','invoice_factura','torg12','act','other']::varchar[]))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_completion_shape" CHECK (("completedAt" IS NULL AND "completedByStaffId" IS NULL AND "realizationNumber" IS NULL AND "realizationDate" IS NULL AND "finalDocumentsDeliveryMethod" IS NULL AND "finalDocumentKinds" IS NULL AND "finalDocumentsDeliveredAt" IS NULL AND "completionComment" IS NULL) OR ("completedAt" IS NOT NULL AND "completedByStaffId" IS NOT NULL AND "realizationNumber" IS NOT NULL AND btrim("realizationNumber") <> '' AND "realizationDate" IS NOT NULL AND "finalDocumentsDeliveryMethod" IS NOT NULL AND "finalDocumentKinds" IS NOT NULL AND "fulfilledAt" IS NOT NULL))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_completion_conditions" CHECK (("finalDocumentsDeliveryMethod" IS NULL) OR ("finalDocumentsDeliveryMethod" IN ('edo','paper','mixed') AND cardinality("finalDocumentKinds") >= 1 AND "finalDocumentsDeliveredAt" IS NOT NULL) OR ("finalDocumentsDeliveryMethod" = 'not_required' AND cardinality("finalDocumentKinds") = 0 AND "finalDocumentsDeliveredAt" IS NULL AND "completionComment" IS NOT NULL AND btrim("completionComment") <> ''))`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_completion_other_comment" CHECK ("finalDocumentKinds" IS NULL OR NOT ('other' = ANY("finalDocumentKinds")) OR ("completionComment" IS NOT NULL AND btrim("completionComment") <> ''))`,
        );

        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_fulfilled_by_staff" FOREIGN KEY ("fulfilledByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_completed_by_staff" FOREIGN KEY ("completedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_completed_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_fulfilled_by_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_completion_other_comment"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_completion_conditions"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_completion_shape"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_final_document_kinds"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_final_documents_delivery_method"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_fulfillment_conditions"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_fulfillment_optional_strings"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_fulfillment_shape"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "CK_orders_fulfillment_method"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_realization_number"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_completed_at"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_orders_fulfilled_at"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "completionComment"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "finalDocumentsDeliveredAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "finalDocumentKinds"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "finalDocumentsDeliveryMethod"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "realizationDate"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "realizationNumber"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "completedByStaffId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "completedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfillmentComment"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfillmentTrackingNumber"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfillmentCarrierName"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfillmentRecipientName"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfillmentMethod"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfilledByStaffId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "fulfilledAt"`,
        );
    }
}
