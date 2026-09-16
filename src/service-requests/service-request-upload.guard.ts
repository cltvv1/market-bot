import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestsService } from './service-requests.service';
import { type PublicAccessRequest } from './public-service-request-access.guard';
import { publicAccessDenied } from './service-request-public-access.service';

type UploadRequest = Request & {
    params: { id?: string };
    webSession?: WebSessionPrincipal;
};

@Injectable()
export class PublicServiceRequestUploadGuard implements CanActivate {
    constructor(private readonly requests: ServiceRequestsService) {}

    async canActivate(context: ExecutionContext) {
        const request = context
            .switchToHttp()
            .getRequest<PublicAccessRequest>();
        const access = request.publicServiceRequestAccess;
        if (!access) {
            request.resume();
            throw publicAccessDenied();
        }
        try {
            await this.requests.assertPublicMessageAttachmentUploadAccess(
                access,
            );
        } catch (error) {
            // Multer has not run; discard the stream without retaining file bytes.
            request.resume();
            throw error;
        }
        return true;
    }
}

@Injectable()
export class DraftServiceRequestUploadGuard implements CanActivate {
    constructor(private readonly requests: ServiceRequestsService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<UploadRequest>();
        await this.requests.assertWebDraftAttachmentUploadAccess(
            this.session(request),
            this.id(request),
        );
        return true;
    }

    private id(request: UploadRequest) {
        if (!request.params.id || !/^[1-9]\d*$/.test(request.params.id)) {
            throw new NotFoundException('Service request was not found');
        }
        return Number(request.params.id);
    }

    private session(request: UploadRequest) {
        if (!request.webSession) {
            throw new NotFoundException('Service request was not found');
        }
        return request.webSession;
    }
}

@Injectable()
export class MessageServiceRequestUploadGuard implements CanActivate {
    constructor(private readonly requests: ServiceRequestsService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<UploadRequest>();
        const id = request.params.id;
        if (!request.webSession || !id || !/^[1-9]\d*$/.test(id)) {
            throw new NotFoundException('Service request was not found');
        }
        await this.requests.assertWebMessageAttachmentUploadAccess(
            request.webSession,
            Number(id),
        );
        return true;
    }
}
