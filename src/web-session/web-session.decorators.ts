import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { WebSessionPrincipal } from './web-session.types';

export const CurrentWebSession = createParamDecorator(
    (_data: unknown, context: ExecutionContext): WebSessionPrincipal => {
        const request = context
            .switchToHttp()
            .getRequest<Request & { webSession: WebSessionPrincipal }>();
        return request.webSession;
    },
);
