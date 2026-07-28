import {
    Controller,
    Get,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentWebSession } from './web-session.decorators';
import { WebSessionGuard } from './web-session.guard';
import { WebSessionService } from './web-session.service';
import type { WebSessionPrincipal } from './web-session.types';
import { RateLimit } from 'src/security/rate-limit';

@Controller('api/client/session')
export class WebSessionController {
    constructor(
        private readonly sessions: WebSessionService,
        private readonly config: ConfigService,
    ) {}

    @Post()
    @RateLimit('web-session-create', 20, 60)
    async createOrRestore(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        const token = this.readCookie(request, this.sessions.getCookieName());
        const existing = await this.sessions.resolve(token);
        if (existing) return this.sessions.presentPublic(existing);

        const created = await this.sessions.create();
        response.cookie(
            this.sessions.getCookieName(),
            created.token,
            this.cookieOptions(created.principal.expiresAt),
        );
        return this.sessions.presentPublic(created.principal);
    }

    @Get()
    @UseGuards(WebSessionGuard)
    @RateLimit('web-session-read', 120, 60)
    current(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.sessions.presentPublic(session);
    }

    @Post('revoke')
    @UseGuards(WebSessionGuard)
    async revoke(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        await this.sessions.revoke(
            this.readCookie(request, this.sessions.getCookieName()),
        );
        response.clearCookie(this.sessions.getCookieName(), this.cookieOptions());
        return { ok: true };
    }

    private cookieOptions(expires?: Date) {
        return {
            httpOnly: true,
            sameSite: 'lax' as const,
            secure: this.config.get<string>('NODE_ENV') === 'production',
            path: '/',
            ...(expires ? { expires } : {}),
        };
    }

    private readCookie(request: Request, name: string) {
        const prefix = `${name}=`;
        const cookie = (request.header('cookie') || '')
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix));
        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
    }
}
