import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from 'src/security/rate-limit';
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

    @Get('resources/:resourceSlug/versions/:versionId/download')
    @RateLimit('public-support-download', 120, 60)
    async downloadVersion(
        @Param('resourceSlug') resourceSlug: string,
        @Param('versionId') versionId: string,
        @Headers('if-none-match') ifNoneMatch: string | undefined,
        @Res() response: Response,
    ) {
        const parsedVersionId = Number(versionId);
        if (!Number.isInteger(parsedVersionId) || parsedVersionId < 1) {
            response.status(404).end();
            return;
        }
        const download = await this.support.openPublicHostedDownload(
            resourceSlug,
            parsedVersionId,
        );
        response.setHeader('ETag', download.etag);
        response.setHeader(
            'Cache-Control',
            'public, max-age=300, must-revalidate',
        );
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (ifNoneMatch === download.etag) {
            download.stream.destroy();
            response.status(304).end();
            return;
        }
        response.setHeader('Content-Type', download.file.mimeType);
        response.setHeader('Content-Length', download.file.sizeBytes);
        response.setHeader(
            'Content-Disposition',
            contentDisposition(download.file.originalName),
        );
        download.stream.on('error', () => response.destroy());
        download.stream.pipe(response);
    }
}

export function contentDisposition(filename: string) {
    const fallback =
        filename
            .normalize('NFKD')
            .replace(/[^\x20-\x7e]/g, '_')
            .replace(/["\\]/g, '_')
            .slice(0, 150) || 'download';
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
