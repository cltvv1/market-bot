import * as path from 'path';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UiServingService } from 'src/ui/ui-serving.service';

@Controller('site')
@ApiTags('site')
export class SiteController {
    constructor(private readonly uiServing: UiServingService) {}

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getSite() {
        return this.uiServing.getEntryHtml('site');
    }

    @Get('site.js')
    getReactScript(@Res() response: Response) {
        return response.sendFile(
            this.uiServing.getAssetPath('site', 'site.js'),
        );
    }

    @Get('site.css')
    getReactStyles(@Res() response: Response) {
        return response.sendFile(
            this.uiServing.getAssetPath('site', 'site.css'),
        );
    }

    @Get('assets/:fileName')
    getAsset(@Param('fileName') fileName: string, @Res() response: Response) {
        const safeFileName = path.basename(fileName);
        response.setHeader('Cache-Control', 'public, max-age=86400');
        return response.sendFile(
            this.uiServing.getAssetPath(
                'site',
                path.join('assets', safeFileName),
            ),
        );
    }

    @Get('*path')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getClientRoute() {
        return this.getSite();
    }
}
