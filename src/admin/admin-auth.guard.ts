import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getAllowedBrowserOrigins, getRequestOrigin } from 'src/security/security.config';
import { AdminAuthService } from './admin-auth.service';
import {
    ADMIN_PERMISSIONS_KEY,
    ADMIN_ANY_PERMISSION_KEY,
    ADMIN_PUBLIC_KEY,
} from './admin-auth.decorators';
import type { AdminPermission } from './admin.permissions';
import type { AdminPrincipal } from './admin-auth.types';

@Injectable()
export class AdminSessionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authService: AdminAuthService,
        private readonly config: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext) {
        if (
            this.reflector.getAllAndOverride<boolean>(ADMIN_PUBLIC_KEY, [
                context.getHandler(),
                context.getClass(),
            ])
        ) {
            return true;
        }

        const request = context
            .switchToHttp()
            .getRequest<Request & { admin?: AdminPrincipal }>();
        const token = this.readCookie(
            request,
            this.authService.getSessionCookieName(),
        );
        const admin = await this.authService.getPrincipalBySessionToken(token);
        if (!admin) {
            throw new UnauthorizedException('Authentication required');
        }

        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
            this.assertSameOrigin(request);
        }

        request.admin = admin;
        return true;
    }

    private assertSameOrigin(request: Request) {
        const source = request.header('origin') || request.header('referer');
        if (!source) {
            throw new ForbiddenException('A same-origin request is required');
        }

        let sourceOrigin: string;
        try {
            sourceOrigin = new URL(source).origin;
        } catch {
            throw new ForbiddenException('A valid request origin is required');
        }

        const requestOrigin = getRequestOrigin(
            request.protocol,
            request.header('host'),
        );
        const allowed = new Set([
            ...getAllowedBrowserOrigins(this.config),
            ...(requestOrigin ? [requestOrigin] : []),
        ]);
        if (!allowed.has(sourceOrigin)) {
            throw new ForbiddenException('Cross-origin admin mutation rejected');
        }
    }

    private readCookie(request: Request, name: string) {
        const cookieHeader = request.header('cookie');
        if (!cookieHeader) return null;
        const prefix = `${name}=`;
        const item = cookieHeader
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix));
        return item ? decodeURIComponent(item.slice(prefix.length)) : null;
    }
}

@Injectable()
export class AdminPermissionGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext) {
        const required =
            this.reflector.getAllAndOverride<AdminPermission[]>(
                ADMIN_PERMISSIONS_KEY,
                [context.getHandler(), context.getClass()],
            ) || [];
        const any =
            this.reflector.getAllAndOverride<AdminPermission[]>(
                ADMIN_ANY_PERMISSION_KEY,
                [context.getHandler(), context.getClass()],
            ) || [];
        if (!required.length && !any.length) return true;

        const request = context
            .switchToHttp()
            .getRequest<Request & { admin?: AdminPrincipal }>();
        const granted = new Set(request.admin?.permissions || []);
        if (
            !required.every((permission) => granted.has(permission)) ||
            (any.length && !any.some((permission) => granted.has(permission)))
        ) {
            throw new ForbiddenException('Insufficient permissions');
        }
        return true;
    }
}
