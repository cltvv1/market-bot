import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportKnowledgeFoundation1787923200000
    implements MigrationInterface
{
    name = 'AddSupportKnowledgeFoundation1787923200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "product_support_profiles" ("productId" integer NOT NULL, "introMarkdown" text, "seoTitle" character varying(160), "seoDescription" character varying(320), "isPublished" boolean NOT NULL DEFAULT false, "publishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_product_support_profiles" PRIMARY KEY ("productId"))`,
        );

        await queryRunner.query(
            `CREATE TABLE "support_resources" ("id" SERIAL NOT NULL, "slug" character varying(160) NOT NULL, "title" character varying(255) NOT NULL, "summary" character varying(500), "descriptionMarkdown" text, "type" character varying(32) NOT NULL, "manufacturerName" character varying(160), "isOfficial" boolean NOT NULL DEFAULT false, "sourceName" character varying(255), "sourceUrl" character varying(2048), "lastVerifiedAt" TIMESTAMP, "seoTitle" character varying(160), "seoDescription" character varying(320), "isPublished" boolean NOT NULL DEFAULT false, "publishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_support_resources_type" CHECK ("type" IN ('driver','utility','software','firmware','manual','quick_start','datasheet','certificate','sdk','other')), CONSTRAINT "PK_support_resources" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_support_resources_slug" ON "support_resources" ("slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_support_resources_public_type" ON "support_resources" ("isPublished", "type")`,
        );

        await queryRunner.query(
            `CREATE TABLE "support_resource_versions" ("id" SERIAL NOT NULL, "resourceId" integer NOT NULL, "versionLabel" character varying(100), "releaseDate" date, "platform" character varying(32) NOT NULL, "architecture" character varying(32) NOT NULL, "languageCode" character varying(16) NOT NULL, "distributionMode" character varying(16) NOT NULL, "externalUrl" character varying(2048), "storedFileId" integer, "releaseNotesMarkdown" text, "isCurrent" boolean NOT NULL DEFAULT false, "isPublished" boolean NOT NULL DEFAULT false, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_support_resource_versions_platform" CHECK ("platform" IN ('windows','linux','macos','android','ios','universal')), CONSTRAINT "CK_support_resource_versions_architecture" CHECK ("architecture" IN ('x86','x64','arm64','universal')), CONSTRAINT "CK_support_resource_versions_language" CHECK ("languageCode" IN ('ru','en','multi')), CONSTRAINT "CK_support_resource_versions_distribution" CHECK ("distributionMode" IN ('external','hosted')), CONSTRAINT "CK_support_resource_versions_location" CHECK (("distributionMode" = 'external' AND "storedFileId" IS NULL) OR ("distributionMode" = 'hosted' AND "externalUrl" IS NULL)), CONSTRAINT "PK_support_resource_versions" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_support_resource_versions_resource" ON "support_resource_versions" ("resourceId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_support_resource_versions_publication_current" ON "support_resource_versions" ("resourceId", "isPublished", "isCurrent")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_support_resource_versions_current_scope" ON "support_resource_versions" ("resourceId", "platform", "architecture", "languageCode") WHERE "isCurrent" = true`,
        );

        await queryRunner.query(
            `CREATE TABLE "product_support_resources" ("id" SERIAL NOT NULL, "productId" integer NOT NULL, "resourceId" integer NOT NULL, "compatibilityNote" character varying(500), "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_product_support_resources_pair" UNIQUE ("productId", "resourceId"), CONSTRAINT "PK_product_support_resources" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_support_resources_product" ON "product_support_resources" ("productId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_support_resources_resource" ON "product_support_resources" ("resourceId")`,
        );

        await queryRunner.query(
            `CREATE TABLE "knowledge_articles" ("id" SERIAL NOT NULL, "slug" character varying(160) NOT NULL, "title" character varying(255) NOT NULL, "excerpt" character varying(500), "bodyMarkdown" text NOT NULL, "type" character varying(32) NOT NULL, "seoTitle" character varying(160), "seoDescription" character varying(320), "authorStaffId" integer, "isPublished" boolean NOT NULL DEFAULT false, "publishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_knowledge_articles_type" CHECK ("type" IN ('instruction','setup','troubleshooting','faq','compatibility','service','other')), CONSTRAINT "PK_knowledge_articles" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_knowledge_articles_slug" ON "knowledge_articles" ("slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_knowledge_articles_public_type" ON "knowledge_articles" ("isPublished", "type")`,
        );

        await queryRunner.query(
            `CREATE TABLE "product_knowledge_articles" ("id" SERIAL NOT NULL, "productId" integer NOT NULL, "articleId" integer NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_product_knowledge_articles_pair" UNIQUE ("productId", "articleId"), CONSTRAINT "PK_product_knowledge_articles" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_knowledge_articles_product" ON "product_knowledge_articles" ("productId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_product_knowledge_articles_article" ON "product_knowledge_articles" ("articleId")`,
        );

        await queryRunner.query(
            `CREATE TABLE "knowledge_article_support_resources" ("id" SERIAL NOT NULL, "articleId" integer NOT NULL, "resourceId" integer NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_knowledge_article_support_resources_pair" UNIQUE ("articleId", "resourceId"), CONSTRAINT "PK_knowledge_article_support_resources" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_knowledge_article_support_resources_article" ON "knowledge_article_support_resources" ("articleId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_knowledge_article_support_resources_resource" ON "knowledge_article_support_resources" ("resourceId")`,
        );

        await queryRunner.query(
            `ALTER TABLE "product_support_profiles" ADD CONSTRAINT "FK_product_support_profiles_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "support_resource_versions" ADD CONSTRAINT "FK_support_resource_versions_resource" FOREIGN KEY ("resourceId") REFERENCES "support_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "support_resource_versions" ADD CONSTRAINT "FK_support_resource_versions_stored_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_support_resources" ADD CONSTRAINT "FK_product_support_resources_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_support_resources" ADD CONSTRAINT "FK_product_support_resources_resource" FOREIGN KEY ("resourceId") REFERENCES "support_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "knowledge_articles" ADD CONSTRAINT "FK_knowledge_articles_author" FOREIGN KEY ("authorStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_knowledge_articles" ADD CONSTRAINT "FK_product_knowledge_articles_product" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_knowledge_articles" ADD CONSTRAINT "FK_product_knowledge_articles_article" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "knowledge_article_support_resources" ADD CONSTRAINT "FK_knowledge_article_resources_article" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "knowledge_article_support_resources" ADD CONSTRAINT "FK_knowledge_article_resources_resource" FOREIGN KEY ("resourceId") REFERENCES "support_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "knowledge_article_support_resources" DROP CONSTRAINT "FK_knowledge_article_resources_resource"`,
        );
        await queryRunner.query(
            `ALTER TABLE "knowledge_article_support_resources" DROP CONSTRAINT "FK_knowledge_article_resources_article"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_knowledge_articles" DROP CONSTRAINT "FK_product_knowledge_articles_article"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_knowledge_articles" DROP CONSTRAINT "FK_product_knowledge_articles_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "knowledge_articles" DROP CONSTRAINT "FK_knowledge_articles_author"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_support_resources" DROP CONSTRAINT "FK_product_support_resources_resource"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_support_resources" DROP CONSTRAINT "FK_product_support_resources_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "support_resource_versions" DROP CONSTRAINT "FK_support_resource_versions_stored_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "support_resource_versions" DROP CONSTRAINT "FK_support_resource_versions_resource"`,
        );
        await queryRunner.query(
            `ALTER TABLE "product_support_profiles" DROP CONSTRAINT "FK_product_support_profiles_product"`,
        );

        await queryRunner.query(
            `DROP TABLE "knowledge_article_support_resources"`,
        );
        await queryRunner.query(`DROP TABLE "product_knowledge_articles"`);
        await queryRunner.query(`DROP TABLE "knowledge_articles"`);
        await queryRunner.query(`DROP TABLE "product_support_resources"`);
        await queryRunner.query(`DROP TABLE "support_resource_versions"`);
        await queryRunner.query(`DROP TABLE "support_resources"`);
        await queryRunner.query(`DROP TABLE "product_support_profiles"`);
    }
}
