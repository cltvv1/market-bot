import {
    Body,
    Controller,
    Get,
    Header,
    Param,
    Patch,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { RateLimit } from 'src/security/rate-limit';
import { RegistrationIdParamDto } from 'src/registrations/registration-admin.dto';
import {
    RegistrationClientEvidenceParams,
    RegistrationDraftSaveDto,
    RegistrationDraftSubmitDto,
} from 'src/registrations/registration-client.dto';
import { RegistrationClientReadService } from 'src/registrations/registration-client-read.service';
import { RegistrationClientCommandsService } from 'src/registrations/registration-client-commands.service';

@Controller('api/client/registrations')
@UseGuards(WebSessionGuard)
export class RegistrationClientController {
    constructor(
        private readonly read: RegistrationClientReadService,
        private readonly commands: RegistrationClientCommandsService,
    ) {}
    @Get()
    @Header('Cache-Control', 'private, no-store')
    @RateLimit('public-sensitive-read', 60, 60)
    list(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.read.list(session);
    }
    @Get(':id')
    @Header('Cache-Control', 'private, no-store')
    @RateLimit('public-sensitive-read', 60, 60)
    detail(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationIdParamDto,
    ) {
        return this.read.details(session, Number(params.id));
    }
    @Post('drafts')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    create(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.commands.start(session);
    }
    @Patch(':id/draft')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    save(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationIdParamDto,
        @Body() body: RegistrationDraftSaveDto,
    ) {
        return this.commands.save(
            session,
            Number(params.id),
            body.expectedUpdatedAt,
            body.values,
        );
    }
    @Post(':id/submit')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    submit(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationIdParamDto,
        @Body() body: RegistrationDraftSubmitDto,
    ) {
        return this.commands.submit(
            session,
            Number(params.id),
            body.expectedUpdatedAt,
        );
    }
    @Get(':id/evidence/:evidenceId')
    @RateLimit('public-sensitive-read', 60, 60)
    async download(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationClientEvidenceParams,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.read.download(
            session,
            Number(params.id),
            Number(params.evidenceId),
        );
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Length', file.sizeBytes);
        response.setHeader(
            'Content-Disposition',
            `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        );
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
    }
}
