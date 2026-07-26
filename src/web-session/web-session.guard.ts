import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebSessionService } from './web-session.service';
import type { WebSessionPrincipal } from './web-session.types';

@Injectable()
export class WebSessionGuard implements CanActivate {
    constructor(private readonly sessions: WebSessionService) {}

    async canActivate(context: ExecutionContext) {
        const request = context
            .switchToHttp()
            .getRequest<Request & { webSession?: WebSessionPrincipal }>();
        const token = this.readCookie(request, this.sessions.getCookieName());
        const principal = await this.sessions.resolve(token);
        if (!principal) {
            throw new UnauthorizedException('Web session is required');
        }
        request.webSession = principal;
        return true;
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
