import * as fs from 'fs';
import * as path from 'path';
import { Controller, Get, Header, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sitePageHtml } from './site.page';

@Controller('site')
@ApiTags('site')
export class SiteController {
    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    getSite() {
        return sitePageHtml;
    }

    @Get('assets/hero-register-service.png')
    getHeroImage(@Res({ passthrough: true }) response: Response) {
        const filePath = path.join(process.cwd(), 'src', 'site', 'assets', 'hero-register-service.png');
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        return new StreamableFile(fs.createReadStream(filePath));
    }
}
