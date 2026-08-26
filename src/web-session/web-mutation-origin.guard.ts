import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
    getAllowedBrowserOrigins,
    getRequestOrigin,
} from 'src/security/security.config';

@Injectable()
export class WebMutationOriginGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<Request>();
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
            throw new ForbiddenException(
                'Cross-origin client mutation rejected',
            );
        }
        return true;
    }
}
