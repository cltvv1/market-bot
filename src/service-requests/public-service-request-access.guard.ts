import {
    CanActivate,
    createParamDecorator,
    ExecutionContext,
    Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
    publicAccessDenied,
    ServiceRequestPublicAccessService,
    type PublicServiceRequestAccess,
    validPublicAccessToken,
} from './service-request-public-access.service';

export type PublicAccessRequest = Request & {
    publicServiceRequestAccess?: PublicServiceRequestAccess;
};
export function readPublicBearer(
    request: Pick<Request, 'headers' | 'rawHeaders'>,
) {
    let count = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2)
        if (request.rawHeaders[index].toLowerCase() === 'authorization')
            count++;
    const value = request.headers.authorization;
    if (count > 1 || typeof value !== 'string' || value.length !== 50)
        throw publicAccessDenied();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(value);
    if (!match || !validPublicAccessToken(match[1])) throw publicAccessDenied();
    return match[1];
}
export const CurrentPublicServiceRequestAccess = createParamDecorator(
    (_: unknown, context: ExecutionContext): PublicServiceRequestAccess => {
        const access = context
            .switchToHttp()
            .getRequest<PublicAccessRequest>().publicServiceRequestAccess;
        if (!access) throw publicAccessDenied();
        return access;
    },
);
@Injectable()
export class PublicServiceRequestAccessGuard implements CanActivate {
    constructor(private readonly access: ServiceRequestPublicAccessService) {}
    async canActivate(context: ExecutionContext) {
        const request = context
            .switchToHttp()
            .getRequest<PublicAccessRequest>();
        const response = context.switchToHttp().getResponse<Response>();
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Pragma', 'no-cache');
        response.vary('Authorization');
        try {
            request.publicServiceRequestAccess = await this.access.resolve(
                readPublicBearer(request),
            );
        } catch (error) {
            request.resume();
            throw error;
        }
        return true;
    }
}
