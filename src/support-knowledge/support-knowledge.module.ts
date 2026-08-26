import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from 'src/admin/admin.module';
import { AuditModule } from 'src/audit/audit.module';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { FilesModule } from 'src/files/files.module';
import { AdminKnowledgeController } from './admin-knowledge.controller';
import { AdminSupportController } from './admin-support.controller';
import { KnowledgeArticleSupportResourceEntity } from './entities/knowledge-article-support-resource.entity';
import { KnowledgeArticleEntity } from './entities/knowledge-article.entity';
import { ProductKnowledgeArticleEntity } from './entities/product-knowledge-article.entity';
import { ProductSupportProfileEntity } from './entities/product-support-profile.entity';
import { ProductSupportResourceEntity } from './entities/product-support-resource.entity';
import { SupportResourceVersionEntity } from './entities/support-resource-version.entity';
import { SupportResourceEntity } from './entities/support-resource.entity';
import { KnowledgeService } from './knowledge.service';
import { PublicKnowledgeController } from './public-knowledge.controller';
import { PublicSupportController } from './public-support.controller';
import { SupportService } from './support.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CatalogProductEntity,
            ProductSupportProfileEntity,
            SupportResourceEntity,
            SupportResourceVersionEntity,
            ProductSupportResourceEntity,
            KnowledgeArticleEntity,
            ProductKnowledgeArticleEntity,
            KnowledgeArticleSupportResourceEntity,
        ]),
        AdminModule,
        AuditModule,
        FilesModule,
    ],
    controllers: [
        PublicSupportController,
        PublicKnowledgeController,
        AdminSupportController,
        AdminKnowledgeController,
    ],
    providers: [SupportService, KnowledgeService],
    exports: [SupportService, KnowledgeService],
})
export class SupportKnowledgeModule {}
