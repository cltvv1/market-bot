import { Controller, Get, Param, Query } from '@nestjs/common';
import { KnowledgeArticleListQueryDto } from './dto/support-knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@Controller('api/knowledge')
export class PublicKnowledgeController {
    constructor(private readonly knowledge: KnowledgeService) {}

    @Get('articles')
    listArticles(@Query() query: KnowledgeArticleListQueryDto) {
        return this.knowledge.listPublicArticles(query);
    }

    @Get('articles/:slug')
    getArticle(@Param('slug') slug: string) {
        return this.knowledge.getPublicArticle(slug);
    }
}
