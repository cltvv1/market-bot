import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogProductListQueryDto } from './dto/catalog.dto';

@Controller('api/catalog')
export class PublicCatalogController {
    constructor(private readonly catalog: CatalogService) {}

    @Get('categories')
    listCategories() {
        return this.catalog.listPublicCategories();
    }

    @Get('products')
    listProducts(@Query() query: CatalogProductListQueryDto) {
        return this.catalog.listPublicProducts(query);
    }

    @Get('products/:slug')
    getProduct(@Param('slug') slug: string) {
        return this.catalog.getPublicProduct(slug);
    }
}
