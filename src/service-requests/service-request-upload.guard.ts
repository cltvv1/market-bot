import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestsService } from './service-requests.service';

type UploadRequest = Request & {
    params: { id?: string; token?: string };
    webSession?: WebSessionPrincipal;
};

@Injectable()
export class PublicServiceRequestUploadGuard implements CanActivate {
    constructor(private readonly requests: ServiceRequestsService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<UploadRequest>();
        const token = request.params.token;
        if (!token || !/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
            // Discard an unparsed body so the client can receive the early 404.
            request.resume();
            throw new NotFoundException('Service request was not found');
        }
        try {
            await this.requests.assertPublicMessageAttachmentUploadAccess(
                token,
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
