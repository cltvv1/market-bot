import {
    Body,
    Controller,
    Get,
    Param,
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
    AdminCatalogProductListQueryDto,
    CatalogIdParamDto,
    CatalogPreconditionDto,
    CatalogProductPublicationDto,
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
    listCategories(@CurrentAdmin() admin: AdminPrincipal) {
        return this.catalog.listAdminCategories(admin);
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
        @Param() params: CatalogIdParamDto,
        @Body() body: UpdateCatalogCategoryDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.updateCategory(Number(params.id), body, admin);
    }

    @Post('categories/:id/publish')
    @RequirePermissions('catalog.manage')
    publishCategory(
        @Param() params: CatalogIdParamDto,
        @Body() body: CatalogPreconditionDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setCategoryPublished(
            Number(params.id),
            true,
            admin,
            body,
        );
    }

    @Post('categories/:id/unpublish')
    @RequirePermissions('catalog.manage')
    unpublishCategory(
        @Param() params: CatalogIdParamDto,
        @Body() body: CatalogPreconditionDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setCategoryPublished(
            Number(params.id),
            false,
            admin,
            body,
        );
    }

    @Get('products')
    @RequirePermissions('catalog.read')
    listProducts(
        @Query() query: AdminCatalogProductListQueryDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.listAdminProducts(query, admin);
    }

    @Get('products/:id')
    @RequirePermissions('catalog.read')
    getProduct(
        @Param() params: CatalogIdParamDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.getAdminProduct(Number(params.id), admin);
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
        @Param() params: CatalogIdParamDto,
        @Body() body: UpdateCatalogProductDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.updateProduct(Number(params.id), body, admin);
    }

    @Post('products/:id/publish')
    @RequirePermissions('catalog.manage')
    publishProduct(
        @Param() params: CatalogIdParamDto,
        @Body() body: CatalogProductPublicationDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setProductPublished(
            Number(params.id),
            true,
            admin,
            body,
        );
    }

    @Post('products/:id/unpublish')
    @RequirePermissions('catalog.manage')
    unpublishProduct(
        @Param() params: CatalogIdParamDto,
        @Body() body: CatalogProductPublicationDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.catalog.setProductPublished(
            Number(params.id),
            false,
            admin,
            body,
        );
    }
}
