import { BadRequestException } from '@nestjs/common';
import type {
    ServiceRequestCustomerStatus,
    ServiceRequestEntity,
    ServiceRequestStatus,
} from './entities/service-request.entity';

const CUSTOMER_STATUS: Record<
    ServiceRequestStatus,
    ServiceRequestCustomerStatus
> = {
    draft: 'received',
    submitted: 'received',
    price_confirmed: 'accepted',
    review_required: 'received',
    clarification_required: 'clarification_required',
    invoice_required: 'accepted',
    waiting_payment: 'waiting_for_customer',
    paid: 'accepted',
    scheduled: 'scheduled',
    in_progress: 'accepted',
    completed: 'completed',
    closed: 'closed',
    cancelled: 'cancelled',
};

const ALLOWED_TRANSITIONS: Partial<
    Record<ServiceRequestStatus, ServiceRequestStatus[]>
> = {
    draft: ['submitted', 'invoice_required', 'review_required', 'cancelled'],
    submitted: [
        'review_required',
        'clarification_required',
        'invoice_required',
        'in_progress',
        'cancelled',
    ],
    price_confirmed: ['invoice_required', 'cancelled'],
    review_required: [
        'clarification_required',
        'invoice_required',
        'in_progress',
        'cancelled',
    ],
    clarification_required: ['submitted', 'review_required', 'cancelled'],
    invoice_required: ['waiting_payment', 'in_progress', 'cancelled'],
    waiting_payment: ['paid', 'clarification_required', 'cancelled'],
    paid: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    scheduled: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['clarification_required', 'completed', 'cancelled'],
    completed: ['closed'],
    closed: [],
    cancelled: [],
};

export function customerStatusFor(status: ServiceRequestStatus) {
    return CUSTOMER_STATUS[status];
}

export function transitionServiceRequest(
    request: ServiceRequestEntity,
    target: ServiceRequestStatus,
    now = new Date(),
) {
    if (request.status === target) return false;
    if (!(ALLOWED_TRANSITIONS[request.status] ?? []).includes(target)) {
        throw new BadRequestException(
            `Service request cannot transition from ${request.status} to ${target}`,
        );
    }
    request.status = target;
    request.customerStatus = customerStatusFor(target);
    if (target === 'submitted' && !request.submittedAt)
        request.submittedAt = now;
    if (target === 'completed') request.completedAt = now;
    if (target === 'closed') request.closedAt = now;
    if (target === 'cancelled') request.cancelledAt = now;
    return true;
}
