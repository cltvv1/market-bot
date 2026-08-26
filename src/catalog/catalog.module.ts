import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from 'src/admin/admin.module';
import { AuditModule } from 'src/audit/audit.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogCategoryEntity } from './entities/catalog-category.entity';
import { CatalogProductAliasEntity } from './entities/catalog-product-alias.entity';
import { CatalogProductEntity } from './entities/catalog-product.entity';
import { PublicCatalogController } from './public-catalog.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CatalogCategoryEntity,
            CatalogProductEntity,
            CatalogProductAliasEntity,
        ]),
        AdminModule,
        AuditModule,
    ],
    controllers: [PublicCatalogController, AdminCatalogController],
    providers: [CatalogService],
    exports: [CatalogService],
})
export class CatalogModule {}
