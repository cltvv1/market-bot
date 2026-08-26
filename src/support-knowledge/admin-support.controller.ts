import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
    CurrentAdmin,
    RequirePermissions,
} from 'src/admin/admin-auth.decorators';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from 'src/admin/admin-auth.guard';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { RateLimit } from 'src/security/rate-limit';
import {
    CreateSupportResourceDto,
    CreateSupportResourceVersionDto,
    SupportResourceListQueryDto,
    UpdateProductSupportProfileDto,
    UpdateSupportResourceDto,
    UpdateSupportResourceVersionDto,
} from './dto/support-knowledge.dto';
import { SupportService } from './support.service';

@Controller('admin/api/support')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminSupportController {
    constructor(private readonly support: SupportService) {}

    @Get('products/:productId')
    @RequirePermissions('support.read')
    getProfile(@Param('productId', ParseIntPipe) productId: number) {
        return this.support.getAdminProfile(productId);
    }

    @Put('products/:productId')
    @RequirePermissions('support.manage')
    putProfile(
        @Param('productId', ParseIntPipe) productId: number,
        @Body() body: UpdateProductSupportProfileDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.updateProfile(productId, body, admin);
    }

    @Patch('products/:productId')
    @RequirePermissions('support.manage')
    patchProfile(
        @Param('productId', ParseIntPipe) productId: number,
        @Body() body: UpdateProductSupportProfileDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.updateProfile(productId, body, admin);
    }

    @Post('products/:productId/publish')
    @RequirePermissions('support.manage')
    publishProfile(
        @Param('productId', ParseIntPipe) productId: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setProfilePublished(productId, true, admin);
    }

    @Post('products/:productId/unpublish')
    @RequirePermissions('support.manage')
    unpublishProfile(
        @Param('productId', ParseIntPipe) productId: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setProfilePublished(productId, false, admin);
    }

    @Get('resources')
    @RequirePermissions('support.read')
    listResources(@Query() query: SupportResourceListQueryDto) {
        return this.support.listAdminResources(query);
    }

    @Get('resources/:id')
    @RequirePermissions('support.read')
    getResource(@Param('id', ParseIntPipe) id: number) {
        return this.support.getAdminResource(id);
    }

    @Post('resources')
    @RequirePermissions('support.manage')
    createResource(
        @Body() body: CreateSupportResourceDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.createResource(body, admin);
    }

    @Patch('resources/:id')
    @RequirePermissions('support.manage')
    updateResource(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateSupportResourceDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.updateResource(id, body, admin);
    }

    @Post('resources/:id/publish')
    @RequirePermissions('support.manage')
    publishResource(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setResourcePublished(id, true, admin);
    }

    @Post('resources/:id/unpublish')
    @RequirePermissions('support.manage')
    unpublishResource(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setResourcePublished(id, false, admin);
    }

    @Post('resources/:id/versions')
    @RequirePermissions('support.manage')
    createVersion(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: CreateSupportResourceVersionDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.createVersion(id, body, admin);
    }

    @Patch('resource-versions/:versionId')
    @RequirePermissions('support.manage')
    updateVersion(
        @Param('versionId', ParseIntPipe) versionId: number,
        @Body() body: UpdateSupportResourceVersionDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.updateVersion(versionId, body, admin);
    }

    @Put('resource-versions/:versionId/file')
    @RequirePermissions('support.manage')
    @RateLimit('admin-support-file-upload', 20, 600)
    uploadVersionFile(
        @Param('versionId', ParseIntPipe) versionId: number,
        @Req() request: Request,
        @Headers('x-vitma-filename') filename: string | undefined,
        @Headers('content-type') contentType: string | undefined,
        @Headers('content-length') contentLength: string | undefined,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.uploadHostedVersionFile(versionId, request, {
            filename,
            contentType,
            contentLength,
            actor: admin,
        });
    }

    @Post('resource-versions/:versionId/publish')
    @RequirePermissions('support.manage')
    publishVersion(
        @Param('versionId', ParseIntPipe) versionId: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setVersionPublished(versionId, true, admin);
    }

    @Post('resource-versions/:versionId/unpublish')
    @RequirePermissions('support.manage')
    unpublishVersion(
        @Param('versionId', ParseIntPipe) versionId: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.setVersionPublished(versionId, false, admin);
    }

    @Post('resource-versions/:versionId/make-current')
    @RequirePermissions('support.manage')
    makeVersionCurrent(
        @Param('versionId', ParseIntPipe) versionId: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.support.makeVersionCurrent(versionId, admin);
    }
}
