import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestPaymentProofService } from './service-request-payment-proof.service';

@Injectable()
export class PaymentProofServiceRequestUploadGuard implements CanActivate {
    constructor(private readonly proofs: ServiceRequestPaymentProofService) {}

    async canActivate(context: ExecutionContext) {
        const request = context
            .switchToHttp()
            .getRequest<Request & { webSession?: WebSessionPrincipal }>();
        try {
            const id = request.params.id;
            if (
                !request.webSession ||
                typeof id !== 'string' ||
                !/^[1-9]\d*$/.test(id)
            ) {
                throw new NotFoundException(
                    'Service request document was not found',
                );
            }
            await this.proofs.preflightForWeb(request.webSession, Number(id));
        } catch (error) {
            // Reject before Multer and drain without retaining any uploaded bytes.
            request.resume();
            throw error;
        }
        return true;
    }
}
