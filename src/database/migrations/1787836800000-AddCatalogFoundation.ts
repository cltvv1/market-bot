import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogFoundation1787836800000 implements MigrationInterface {
    name = 'AddCatalogFoundation1787836800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "catalog_categories" ("id" SERIAL NOT NULL, "parentId" integer, "name" character varying(255) NOT NULL, "slug" character varying(160) NOT NULL, "description" text, "sortOrder" integer NOT NULL DEFAULT '0', "isPublished" boolean NOT NULL DEFAULT false, "oneCRef" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_catalog_categories_not_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id"), CONSTRAINT "PK_catalog_categories" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_catalog_categories_slug" ON "catalog_categories" ("slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_categories_parent" ON "catalog_categories" ("parentId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_categories_public_order" ON "catalog_categories" ("isPublished", "sortOrder")`,
        );

        await queryRunner.query(
            `CREATE TABLE "catalog_products" ("id" SERIAL NOT NULL, "categoryId" integer NOT NULL, "sku" character varying(100) NOT NULL, "slug" character varying(160) NOT NULL, "name" character varying(255) NOT NULL, "brand" character varying(120), "shortDescription" character varying(500), "description" text, "displayPriceMinor" integer, "vatRate" smallint NOT NULL DEFAULT '2000', "availabilityStatus" character varying(32) NOT NULL DEFAULT 'on_request', "features" jsonb NOT NULL DEFAULT '[]', "specifications" jsonb NOT NULL DEFAULT '{}', "packageContents" jsonb NOT NULL DEFAULT '[]', "isActive" boolean NOT NULL DEFAULT true, "isPublished" boolean NOT NULL DEFAULT false, "isPopular" boolean NOT NULL DEFAULT false, "isNew" boolean NOT NULL DEFAULT false, "oneCRef" character varying(255), "oneCSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_catalog_products_price_nonnegative" CHECK ("displayPriceMinor" IS NULL OR "displayPriceMinor" >= 0), CONSTRAINT "CK_catalog_products_vat_rate" CHECK ("vatRate" IN (0,500,700,1000,2000)), CONSTRAINT "CK_catalog_products_availability" CHECK ("availabilityStatus" IN ('in_stock','low_stock','on_request','unavailable')), CONSTRAINT "PK_catalog_products" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_catalog_products_sku" ON "catalog_products" ("sku")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_catalog_products_slug" ON "catalog_products" ("slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_products_category" ON "catalog_products" ("categoryId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_products_publication" ON "catalog_products" ("categoryId", "isPublished", "isActive")`,
        );

        await queryRunner.query(
            `CREATE TABLE "catalog_product_aliases" ("id" SERIAL NOT NULL, "productId" integer NOT NULL, "alias" character varying(160) NOT NULL, "normalizedAlias" character varying(160) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_catalog_product_aliases_product_normalized" UNIQUE ("productId", "normalizedAlias"), CONSTRAINT "PK_catalog_product_aliases" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_product_aliases_normalized" ON "catalog_product_aliases" ("normalizedAlias")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_catalog_product_aliases_product" ON "catalog_product_aliases" ("productId")`,
        );

        await queryRunner.query(
            `ALTER TABLE "catalog_categories" ADD CONSTRAINT "FK_catalog_categories_parent" FOREIGN KEY ("parentId") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "catalog_products" ADD CONSTRAINT "FK_catalog_products_category" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "catalog_product_aliases" ADD CONSTRAINT "FK_catalog_product_aliases_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "catalog_product_aliases" DROP CONSTRAINT "FK_catalog_product_aliases_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "catalog_products" DROP CONSTRAINT "FK_catalog_products_category"`,
        );
        await queryRunner.query(
            `ALTER TABLE "catalog_categories" DROP CONSTRAINT "FK_catalog_categories_parent"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_product_aliases_product"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_product_aliases_normalized"`,
        );
        await queryRunner.query(`DROP TABLE "catalog_product_aliases"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_products_publication"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_products_category"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_catalog_products_slug"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_catalog_products_sku"`,
        );
        await queryRunner.query(`DROP TABLE "catalog_products"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_categories_public_order"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_catalog_categories_parent"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_catalog_categories_slug"`,
        );
        await queryRunner.query(`DROP TABLE "catalog_categories"`);
    }
}
