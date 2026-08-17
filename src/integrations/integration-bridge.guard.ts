import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class IntegrationBridgeGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext) {
        const expected = this.config
            .get<string>('INTEGRATION_BRIDGE_KEY')
            ?.trim();
        if (!expected)
            throw new ServiceUnavailableException(
                'Integration bridge is not configured',
            );
        const provided =
            context
                .switchToHttp()
                .getRequest<Request>()
                .header('x-vitma-bridge-key') ?? '';
        const expectedBuffer = Buffer.from(expected);
        const providedBuffer = Buffer.from(provided);
        if (
            expectedBuffer.length !== providedBuffer.length ||
            !timingSafeEqual(expectedBuffer, providedBuffer)
        ) {
            throw new UnauthorizedException(
                'Integration bridge authentication failed',
            );
        }
        return true;
    }
}
