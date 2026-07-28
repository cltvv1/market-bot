import * as fs from 'fs';
import * as path from 'path';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sitePageHtml } from './site.page';
import { UiServingService } from 'src/ui/ui-serving.service';

@Controller('site')
@ApiTags('site')
export class SiteController {
    constructor(private readonly uiServing: UiServingService) {}

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getSite() {
        return this.uiServing.getEntryHtml('site', sitePageHtml);
    }

    @Get('site.js')
    getReactScript(@Res() response: Response) {
        return response.sendFile(this.uiServing.getAssetPath('site', 'site.js'));
    }

    @Get('site.css')
    getReactStyles(@Res() response: Response) {
        return response.sendFile(this.uiServing.getAssetPath('site', 'site.css'));
    }

    @Get('assets/:fileName')
    getAsset(@Param('fileName') fileName: string, @Res() response: Response) {
        const safeFileName = path.basename(fileName);
        const builtAsset = path.join(process.cwd(), 'client-ui', 'dist', 'assets', safeFileName);
        if (fs.existsSync(builtAsset)) {
            response.setHeader('Cache-Control', 'public, max-age=86400');
            return response.sendFile(builtAsset);
        }

        if (safeFileName === 'hero-register-service.png') {
            return response.sendFile(path.join(process.cwd(), 'src', 'site', 'assets', safeFileName));
        }

        return response.status(404).send('Asset not found');
    }

    @Get('*path')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getClientRoute() {
        return this.getSite();
    }
}
