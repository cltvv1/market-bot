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
import {
    CreateKnowledgeArticleDto,
    KnowledgeArticleListQueryDto,
    UpdateKnowledgeArticleDto,
} from './dto/support-knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@Controller('admin/api/knowledge')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminKnowledgeController {
    constructor(private readonly knowledge: KnowledgeService) {}

    @Get('articles')
    @RequirePermissions('knowledge.read')
    listArticles(@Query() query: KnowledgeArticleListQueryDto) {
        return this.knowledge.listAdminArticles(query);
    }

    @Get('articles/:id')
    @RequirePermissions('knowledge.read')
    getArticle(@Param('id', ParseIntPipe) id: number) {
        return this.knowledge.getAdminArticle(id);
    }

    @Post('articles')
    @RequirePermissions('knowledge.manage')
    createArticle(
        @Body() body: CreateKnowledgeArticleDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.knowledge.createArticle(body, admin);
    }

    @Patch('articles/:id')
    @RequirePermissions('knowledge.manage')
    updateArticle(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateKnowledgeArticleDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.knowledge.updateArticle(id, body, admin);
    }

    @Post('articles/:id/publish')
    @RequirePermissions('knowledge.manage')
    publishArticle(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.knowledge.setArticlePublished(id, true, admin);
    }

    @Post('articles/:id/unpublish')
    @RequirePermissions('knowledge.manage')
    unpublishArticle(
        @Param('id', ParseIntPipe) id: number,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.knowledge.setArticlePublished(id, false, admin);
    }
}
