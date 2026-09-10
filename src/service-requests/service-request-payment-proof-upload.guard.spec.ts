import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentProofServiceRequestUploadGuard } from './service-request-payment-proof-upload.guard';
import { ServiceRequestsController } from './service-requests.controller';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('payment proof pre-parser guard', () => {
    const proofs = { preflightForWeb: jest.fn() };
    const guard = new PaymentProofServiceRequestUploadGuard(proofs as never);
    const makeContext = (id = '42') => {
        const request = {
            params: { id },
            webSession: { userId: 7 },
            resume: jest.fn(),
        };
        return {
            request,
            context: { switchToHttp: () => ({ getRequest: () => request }) },
        };
    };
    beforeEach(() => jest.resetAllMocks());
    it('orders session, origin, and owner guards before the upload interceptor', () => {
        expect(
            Reflect.getMetadata(GUARDS_METADATA, ServiceRequestsController),
        ).toEqual([WebSessionGuard]);
        expect(
            Reflect.getMetadata(
                GUARDS_METADATA,
                // Controller method metadata is inspected, not invoked unbound.
                // eslint-disable-next-line @typescript-eslint/unbound-method
                ServiceRequestsController.prototype.uploadPaymentProof,
            ),
        ).toEqual([
            WebMutationOriginGuard,
            PaymentProofServiceRequestUploadGuard,
        ]);
    });
    it('resolves the authenticated owner before parsing', async () => {
        const { request, context } = makeContext();
        await expect(guard.canActivate(context as never)).resolves.toBe(true);
        expect(proofs.preflightForWeb).toHaveBeenCalledWith(
            request.webSession,
            42,
        );
    });
    it('drains foreign uploads on denial', async () => {
        proofs.preflightForWeb.mockRejectedValue(new ForbiddenException());
        const { request, context } = makeContext();
        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
        expect(request.resume).toHaveBeenCalledTimes(1);
    });
    it.each(['-1', '0', '1e2', '1.5', 'abc'])(
        'rejects path %s without calling the service',
        async (id) => {
            const { request, context } = makeContext(id);
            await expect(guard.canActivate(context as never)).rejects.toThrow(
                NotFoundException,
            );
            expect(proofs.preflightForWeb).not.toHaveBeenCalled();
            expect(request.resume).toHaveBeenCalledTimes(1);
        },
    );
});
