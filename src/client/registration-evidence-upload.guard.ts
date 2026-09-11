import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RegistrationReadinessService } from 'src/registrations/registration-readiness.service';
import { validateSync } from 'class-validator';
import { RegistrationClientRequirementParams } from 'src/registrations/registration-client.dto';
import { assertWebRegistrationMutable } from 'src/registrations/registration-client-policy';
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
        if (!request.webSession) {
            throw new NotFoundException('Registration was not found');
        }
        const params = Object.assign(
            new RegistrationClientRequirementParams(),
            { id, kind },
        );
        if (validateSync(params).length)
            throw new BadRequestException({
                code: 'VALIDATION_ERROR',
                message: 'Invalid registration or requirement',
                errors: [],
            });
        const registration = await this.readiness.assertEvidenceUploadAccess(
            request.webSession,
            Number(id),
        );
        assertWebRegistrationMutable(registration);
        return true;
    }
}
