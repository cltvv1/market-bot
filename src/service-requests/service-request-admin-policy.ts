import type { AdminPermission } from '../admin/admin.permissions';
import type {
    ServiceRequestEntity,
    ServiceRequestStatus,
} from './entities/service-request.entity';
import { canTransitionServiceRequest } from './service-request-status';

export type ServiceAdminActionId =
    | 'assign_engineer'
    | 'update_operator_state'
    | 'send_customer_message'
    | 'add_internal_note'
    | 'submit_request'
    | 'mark_review_required'
    | 'request_clarification'
    | 'mark_invoice_required'
    | 'upload_invoice'
    | 'replace_invoice'
    | 'confirm_payment'
    | 'schedule_visit'
    | 'reschedule_visit'
    | 'start_work'
    | 'complete_work'
    | 'close_request'
    | 'cancel_request';

const reasons = {
    PAYMENT_PROOF_REQUIRED: 'Сначала требуется платёжное поручение клиента',
    INVOICE_REQUIRED: 'Сначала требуется счёт',
    REQUEST_ALREADY_TERMINAL: 'Работа с заявкой завершена',
    REQUEST_NOT_READY: 'Сначала отправьте заявку на рассмотрение',
    CURRENT_STATUS_NOT_SUPPORTED: 'Действие недоступно на текущем этапе',
    ENGINEER_REQUIRED: 'Сначала назначьте инженера',
} as const;
export type ServiceActionReason = keyof typeof reasons;
export interface ServiceAdminAction {
    id: ServiceAdminActionId;
    allowed: boolean;
    reasonCode: ServiceActionReason | null;
    reason: string | null;
    targetStatus: ServiceRequestStatus | null;
    expectedVersion: number;
}
export type ServicePolicyRequest = Pick<
    ServiceRequestEntity,
    | 'status'
    | 'version'
    | 'paymentProofFileId'
    | 'invoiceStoredFileId'
    | 'assignedEngineerId'
>;

export function requiredPermissionForServiceTransition(
    status: ServiceRequestStatus,
): AdminPermission {
    if (['invoice_required', 'waiting_payment'].includes(status))
        return 'serviceRequests.invoice';
    if (status === 'paid') return 'serviceRequests.payment';
    if (status === 'scheduled') return 'serviceRequests.schedule';
    if (['completed', 'closed', 'cancelled'].includes(status))
        return 'serviceRequests.close';
    return 'serviceRequests.update';
}

export const serviceTransitionActions: Partial<
    Record<ServiceRequestStatus, ServiceAdminActionId>
> = {
    submitted: 'submit_request',
    review_required: 'mark_review_required',
    clarification_required: 'request_clarification',
    invoice_required: 'mark_invoice_required',
    paid: 'confirm_payment',
    in_progress: 'start_work',
    completed: 'complete_work',
    closed: 'close_request',
    cancelled: 'cancel_request',
};

export function serviceRequestWorkflow(
    request: ServicePolicyRequest,
    permissions: readonly string[],
) {
    const actions: ServiceAdminAction[] = [];
    const terminal = ['completed', 'closed', 'cancelled'].includes(
        request.status,
    );
    const add = (
        id: ServiceAdminActionId,
        permission: AdminPermission,
        reasonCode: ServiceActionReason | null = null,
        targetStatus: ServiceRequestStatus | null = null,
    ) => {
        if (permissions.includes(permission))
            actions.push({
                id,
                allowed: reasonCode === null,
                reasonCode,
                reason: reasonCode ? reasons[reasonCode] : null,
                targetStatus,
                expectedVersion: request.version,
            });
    };
    const terminalReason = terminal ? 'REQUEST_ALREADY_TERMINAL' : null;
    add('assign_engineer', 'serviceRequests.assign', terminalReason);
    add('update_operator_state', 'serviceRequests.update', terminalReason);
    add(
        'send_customer_message',
        'serviceRequests.update',
        ['closed', 'cancelled'].includes(request.status)
            ? 'REQUEST_ALREADY_TERMINAL'
            : request.status === 'draft'
              ? 'REQUEST_NOT_READY'
              : null,
    );
    // Internal notes remain available on closed records; they never enqueue customer delivery.
    add('add_internal_note', 'serviceRequests.update');
    for (const [target, id] of Object.entries(
        serviceTransitionActions,
    ) as Array<[ServiceRequestStatus, ServiceAdminActionId]>) {
        const supported = canTransitionServiceRequest(request.status, target);
        add(
            id,
            requiredPermissionForServiceTransition(target),
            !supported
                ? terminal
                    ? 'REQUEST_ALREADY_TERMINAL'
                    : 'CURRENT_STATUS_NOT_SUPPORTED'
                : target === 'paid' && !request.paymentProofFileId
                  ? 'PAYMENT_PROOF_REQUIRED'
                  : null,
            target,
        );
    }
    add(
        'upload_invoice',
        'serviceRequests.invoice',
        request.status === 'invoice_required' && !request.invoiceStoredFileId
            ? null
            : (terminalReason ?? 'CURRENT_STATUS_NOT_SUPPORTED'),
        'waiting_payment',
    );
    add(
        'replace_invoice',
        'serviceRequests.invoice',
        request.status !== 'waiting_payment'
            ? (terminalReason ?? 'CURRENT_STATUS_NOT_SUPPORTED')
            : !request.invoiceStoredFileId
              ? 'INVOICE_REQUIRED'
              : null,
        'waiting_payment',
    );
    for (const [id, status] of [
        ['schedule_visit', 'paid'],
        ['reschedule_visit', 'scheduled'],
    ] as const) {
        add(
            id,
            'serviceRequests.schedule',
            request.status !== status
                ? (terminalReason ?? 'CURRENT_STATUS_NOT_SUPPORTED')
                : !request.assignedEngineerId
                  ? 'ENGINEER_REQUIRED'
                  : null,
            'scheduled',
        );
    }
    const primary: Partial<Record<ServiceRequestStatus, ServiceAdminActionId>> =
        {
            invoice_required: 'upload_invoice',
            waiting_payment: 'confirm_payment',
            scheduled: 'start_work',
            in_progress: 'complete_work',
            completed: 'close_request',
        };
    const candidate = primary[request.status];
    return {
        expectedVersion: request.version,
        primaryActionId:
            actions.find((action) => action.id === candidate)?.id ?? null,
        actions,
    };
}
