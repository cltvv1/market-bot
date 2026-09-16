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
        const origin = this.singleHeader(request, 'origin');
        // Referer is a fallback only for an absent Origin, never an invalid one.
        const source = origin ?? this.singleHeader(request, 'referer');
        if (!source) {
            throw new ForbiddenException('A same-origin request is required');
        }

        let sourceOrigin: string;
        try {
            const parsed = new URL(source);
            if (
                !['http:', 'https:'].includes(parsed.protocol) ||
                parsed.username ||
                parsed.password ||
                (origin !== undefined && parsed.origin !== origin)
            ) {
                throw new Error('Invalid origin header');
            }
            sourceOrigin = parsed.origin;
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

    private singleHeader(request: Request, name: 'origin' | 'referer') {
        const value = request.headers[name];
        let count = 0;
        for (let index = 0; index < request.rawHeaders.length; index += 2) {
            if (request.rawHeaders[index].toLowerCase() === name) count += 1;
        }
        if (count > 1 || (value !== undefined && typeof value !== 'string')) {
            throw new ForbiddenException('A valid request origin is required');
        }
        return value;
    }
}
