import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    SupportProductListQueryDto,
    SupportResourceListQueryDto,
} from './dto/support-knowledge.dto';
import { SupportService } from './support.service';

@Controller('api/support')
export class PublicSupportController {
    constructor(private readonly support: SupportService) {}

    @Get('products')
    listProducts(@Query() query: SupportProductListQueryDto) {
        return this.support.listPublicProducts(query);
    }

    @Get('products/:productSlug')
    getProduct(@Param('productSlug') productSlug: string) {
        return this.support.getPublicProduct(productSlug);
    }

    @Get('resources')
    listResources(@Query() query: SupportResourceListQueryDto) {
        return this.support.listPublicResources(query);
    }

    @Get('resources/:slug')
    getResource(@Param('slug') slug: string) {
        return this.support.getPublicResource(slug);
    }
}
