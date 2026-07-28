import {
    CanActivate,
    ExecutionContext,
    HttpException,
    Injectable,
    SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

const RATE_LIMIT_KEY = 'security:rate-limit';

interface RateLimitOptions {
    bucket: string;
    limit: number;
    windowSeconds: number;
}

interface RateEntry {
    count: number;
    resetAt: number;
}

export const RateLimit = (
    bucket: string,
    limit: number,
    windowSeconds: number,
) => SetMetadata(RATE_LIMIT_KEY, { bucket, limit, windowSeconds });

@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly entries = new Map<string, RateEntry>();
    private requests = 0;

    constructor(
        private readonly reflector: Reflector,
        private readonly config: ConfigService,
    ) {}

    canActivate(context: ExecutionContext) {
        const configured = this.reflector.getAllAndOverride<RateLimitOptions>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!configured) return true;

        const options = this.withEnvironmentOverrides(configured);
        const http = context.switchToHttp();
        const request = http.getRequest<Request>();
        const response = http.getResponse<Response>();
        const now = Date.now();
        const key = `${options.bucket}:${this.clientKey(request)}`;
        let entry = this.entries.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = {
                count: 0,
                resetAt: now + options.windowSeconds * 1000,
            };
        }
        entry.count += 1;
        this.entries.set(key, entry);

        response.setHeader('RateLimit-Limit', options.limit);
        response.setHeader(
            'RateLimit-Remaining',
            Math.max(options.limit - entry.count, 0),
        );
        response.setHeader(
            'RateLimit-Reset',
            Math.ceil(entry.resetAt / 1000),
        );
        if (entry.count > options.limit) {
            const retryAfter = Math.max(
                Math.ceil((entry.resetAt - now) / 1000),
                1,
            );
            response.setHeader('Retry-After', retryAfter);
            throw new HttpException(
                {
                    code: 'RATE_LIMITED',
                    message:
                        'Слишком много запросов. Повторите попытку позже.',
                    errors: [],
                },
                429,
            );
        }

        this.requests += 1;
        if (this.requests % 500 === 0) this.prune(now);
        return true;
    }

    private withEnvironmentOverrides(options: RateLimitOptions) {
        const key = options.bucket
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_');
        return {
            ...options,
            limit:
                this.config.get<number>(`RATE_LIMIT_${key}_LIMIT`) ??
                options.limit,
            windowSeconds:
                this.config.get<number>(
                    `RATE_LIMIT_${key}_WINDOW_SECONDS`,
                ) ?? options.windowSeconds,
        };
    }

    private clientKey(request: Request) {
        const cookie = request.header('cookie') || '';
        const sessionPart = cookie
            ? createHash('sha256').update(cookie).digest('hex').slice(0, 16)
            : 'anonymous';
        return `${request.ip || request.socket.remoteAddress || 'unknown'}:${sessionPart}`;
    }

    private prune(now: number) {
        for (const [key, entry] of this.entries) {
            if (entry.resetAt <= now) this.entries.delete(key);
        }
    }
}
