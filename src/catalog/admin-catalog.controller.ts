import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    CurrentAdmin,
    RequirePermissions,
} from 'src/admin/admin-auth.decorators';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from 'src/admin/admin-auth.guard';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { CatalogService } from './catalog.service';
import {
    CatalogProductListQueryDto,
    CreateCatalogCategoryDto,
    CreateCatalogProductDto,
    UpdateCatalogCategoryDto,
    UpdateCatalogProductDto,
} from './dto/catalog.dto';

@Controller('admin/api/catalog')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminCatalogController {
    constructor(private readonly catalog: CatalogService) {}

    @Get('categories')
    @RequirePermissions('catalog.read')
    listCategories() {
        return this.catalog.listAdminCategories();
    }

    @Post('categories')
    @RequirePermissions('catalog.manage')
    createCategory(
        @Body() body: CreateCatalogCategoryDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.createCategory(body, admin);
    }

    @Patch('categories/:id')
    @RequirePermissions('catalog.manage')
    updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateCatalogCategoryDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.updateCategory(id, body, admin);
    }

    @Post('categories/:id/publish')
    @RequirePermissions('catalog.manage')
    publishCategory(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setCategoryPublished(id, true, admin);
    }

    @Post('categories/:id/unpublish')
    @RequirePermissions('catalog.manage')
    unpublishCategory(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setCategoryPublished(id, false, admin);
    }

    @Get('products')
    @RequirePermissions('catalog.read')
    listProducts(@Query() query: CatalogProductListQueryDto) {
        return this.catalog.listAdminProducts(query);
    }

    @Get('products/:id')
    @RequirePermissions('catalog.read')
    getProduct(@Param('id', ParseIntPipe) id: number) {
        return this.catalog.getAdminProduct(id);
    }

    @Post('products')
    @RequirePermissions('catalog.manage')
    createProduct(
        @Body() body: CreateCatalogProductDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.createProduct(body, admin);
    }

    @Patch('products/:id')
    @RequirePermissions('catalog.manage')
    updateProduct(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateCatalogProductDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.updateProduct(id, body, admin);
    }

    @Post('products/:id/publish')
    @RequirePermissions('catalog.manage')
    publishProduct(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setProductPublished(id, true, admin);
    }

    @Post('products/:id/unpublish')
    @RequirePermissions('catalog.manage')
    unpublishProduct(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setProductPublished(id, false, admin);
    }
}
