import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RateLimit } from 'src/security/rate-limit';
import { CatalogService } from './catalog.service';
import {
    CatalogProductListQueryDto,
    ResolveCatalogProductsDto,
} from './dto/catalog.dto';

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

    @Post('products/resolve')
    @RateLimit('public-catalog-resolve', 120, 60)
    resolve(@Body() body: ResolveCatalogProductsDto) {
        return this.catalog.resolvePublicProducts(body.ids);
    }
}
