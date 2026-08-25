import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RegistrationReadinessService } from 'src/registrations/registration-readiness.service';
import {
    REGISTRATION_REQUIREMENT_KINDS,
    type RegistrationRequirementKind,
} from 'src/registrations/registration.types';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';

type EvidenceRequest = Request & {
    params: { id?: string; kind?: string };
    webSession?: WebSessionPrincipal;
};

@Injectable()
export class RegistrationEvidenceUploadGuard implements CanActivate {
    constructor(private readonly readiness: RegistrationReadinessService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<EvidenceRequest>();
        const { id, kind } = request.params;
        if (
            !request.webSession ||
            !id ||
            !/^[1-9]\d*$/.test(id) ||
            !REGISTRATION_REQUIREMENT_KINDS.includes(
                kind as RegistrationRequirementKind,
            )
        ) {
            throw new NotFoundException('Registration was not found');
        }
        await this.readiness.assertEvidenceUploadAccess(
            {
                platform: 'web',
                chatId: request.webSession.chatId,
            },
            Number(id),
        );
        return true;
    }
}
