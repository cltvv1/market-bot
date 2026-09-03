import { getPermissions } from '../admin/admin.permissions';
import type {
    ServiceRequestEntity,
    ServiceRequestStatus,
} from './entities/service-request.entity';
import { serviceRequestWorkflow } from './service-request-admin-policy';

const statuses: ServiceRequestStatus[] = [
    'draft',
    'submitted',
    'price_confirmed',
    'review_required',
    'clarification_required',
    'invoice_required',
    'waiting_payment',
    'paid',
    'scheduled',
    'in_progress',
    'completed',
    'closed',
    'cancelled',
];
const request = (
    status: ServiceRequestStatus,
    overrides: Partial<ServiceRequestEntity> = {},
) => ({
    status,
    version: 7,
    invoiceStoredFileId: null,
    paymentProofFileId: null,
    assignedEngineerId: null,
    ...overrides,
});

describe('admin ServiceRequest action policy', () => {
    it.each(statuses)(
        'projects versioned, unique permission-filtered actions for %s',
        (status) => {
            const workflow = serviceRequestWorkflow(
                request(status),
                getPermissions(['operator']),
            );
            expect(workflow.expectedVersion).toBe(7);
            expect(
                new Set(workflow.actions.map((action) => action.id)).size,
            ).toBe(workflow.actions.length);
            for (const action of workflow.actions) {
                expect(action.expectedVersion).toBe(7);
                expect(
                    action.allowed
                        ? action.reasonCode === null
                        : Boolean(action.reasonCode),
                ).toBe(true);
            }
            if (workflow.primaryActionId)
                expect(
                    workflow.actions.some(
                        (action) => action.id === workflow.primaryActionId,
                    ),
                ).toBe(true);
            expect(
                serviceRequestWorkflow(
                    request(status),
                    getPermissions(['engineer']),
                ).actions,
            ).toEqual([]);
            expect(
                serviceRequestWorkflow(
                    request(status),
                    getPermissions(['sales_manager']),
                ).actions,
            ).toEqual([]);
        },
    );
    it('requires canonical proof, never a generic attachment, for payment', () => {
        const blocked = serviceRequestWorkflow(
            request('waiting_payment'),
            getPermissions(['operator']),
        );
        expect(blocked.primaryActionId).toBe('confirm_payment');
        expect(
            blocked.actions.find((a) => a.id === 'confirm_payment'),
        ).toMatchObject({
            allowed: false,
            reasonCode: 'PAYMENT_PROOF_REQUIRED',
            targetStatus: 'paid',
        });
        const allowed = serviceRequestWorkflow(
            request('waiting_payment', { paymentProofFileId: 4 }),
            getPermissions(['operator']),
        );
        expect(
            allowed.actions.find((a) => a.id === 'confirm_payment')?.allowed,
        ).toBe(true);
    });
    it.each([
        ['invoice_required', 'upload_invoice'],
        ['scheduled', 'start_work'],
        ['in_progress', 'complete_work'],
        ['completed', 'close_request'],
    ] as const)(
        'chooses one authoritative primary action in %s',
        (status, primary) => {
            expect(
                serviceRequestWorkflow(
                    request(status),
                    getPermissions(['superadmin']),
                ).primaryActionId,
            ).toBe(primary);
        },
    );
    it.each([
        'submitted',
        'review_required',
        'paid',
        'clarification_required',
    ] as const)('does not invent a primary action in %s', (status) => {
        expect(
            serviceRequestWorkflow(
                request(status),
                getPermissions(['operator']),
            ).primaryActionId,
        ).toBeNull();
    });
    it('omits actions without permission, including primary', () => {
        const result = serviceRequestWorkflow(
            request('waiting_payment', { paymentProofFileId: 1 }),
            ['serviceRequests.update'],
        );
        expect(result.actions.some((a) => a.id === 'confirm_payment')).toBe(
            false,
        );
        expect(result.primaryActionId).toBeNull();
    });
    it('allows internal notes after closure but blocks customer messages and state edits', () => {
        const result = serviceRequestWorkflow(
            request('closed'),
            getPermissions(['operator']),
        );
        expect(
            result.actions.find((a) => a.id === 'add_internal_note')?.allowed,
        ).toBe(true);
        for (const id of [
            'send_customer_message',
            'assign_engineer',
            'update_operator_state',
        ]) {
            expect(result.actions.find((a) => a.id === id)).toMatchObject({
                allowed: false,
                reasonCode: 'REQUEST_ALREADY_TERMINAL',
            });
        }
    });
    it('exposes invoice and visit only through their specialized commands', () => {
        const invoice = serviceRequestWorkflow(
            request('invoice_required'),
            getPermissions(['operator']),
        );
        expect(
            invoice.actions
                .filter(
                    (a) => a.allowed && a.targetStatus === 'waiting_payment',
                )
                .map((a) => a.id),
        ).toEqual(['upload_invoice']);
        const paid = serviceRequestWorkflow(
            request('paid', { assignedEngineerId: 2 }),
            getPermissions(['operator']),
        );
        expect(
            paid.actions
                .filter((a) => a.allowed && a.targetStatus === 'scheduled')
                .map((a) => a.id),
        ).toEqual(['schedule_visit']);
        expect(
            serviceRequestWorkflow(
                request('paid'),
                getPermissions(['operator']),
            ).actions.find((a) => a.id === 'schedule_visit'),
        ).toMatchObject({ allowed: false, reasonCode: 'ENGINEER_REQUIRED' });
    });
});
