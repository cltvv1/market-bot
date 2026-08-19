import { BadRequestException } from '@nestjs/common';
import { ServiceRequestEntity } from './entities/service-request.entity';
import {
    customerStatusFor,
    transitionServiceRequest,
} from './service-request-status';

describe('service request lifecycle', () => {
    const requestAt = (status: ServiceRequestEntity['status']) => {
        const request = new ServiceRequestEntity();
        request.status = status;
        request.customerStatus = customerStatusFor(status);
        request.submittedAt = null;
        request.completedAt = null;
        request.closedAt = null;
        request.cancelledAt = null;
        return request;
    };

    it('maps internal states to the stable customer vocabulary', () => {
        expect(customerStatusFor('submitted')).toBe('received');
        expect(customerStatusFor('invoice_required')).toBe('accepted');
        expect(customerStatusFor('waiting_payment')).toBe(
            'waiting_for_customer',
        );
        expect(customerStatusFor('clarification_required')).toBe(
            'clarification_required',
        );
    });

    it('sets customer status and lifecycle timestamps on transition', () => {
        const request = requestAt('draft');
        const now = new Date('2026-08-19T00:00:00.000Z');
        expect(transitionServiceRequest(request, 'submitted', now)).toBe(true);
        expect(request.customerStatus).toBe('received');
        expect(request.submittedAt).toEqual(now);
    });

    it('is locally idempotent for a repeated target state', () => {
        const request = requestAt('submitted');
        expect(transitionServiceRequest(request, 'submitted')).toBe(false);
    });

    it('rejects an invalid state jump without mutating the request', () => {
        const request = requestAt('draft');
        expect(() => transitionServiceRequest(request, 'completed')).toThrow(
            BadRequestException,
        );
        expect(request.status).toBe('draft');
        expect(request.completedAt).toBeNull();
    });

    it('records terminal timestamps', () => {
        const request = requestAt('in_progress');
        const now = new Date('2026-08-19T01:00:00.000Z');
        transitionServiceRequest(request, 'completed', now);
        expect(request.completedAt).toEqual(now);
        transitionServiceRequest(request, 'closed', now);
        expect(request.closedAt).toEqual(now);
    });
});
