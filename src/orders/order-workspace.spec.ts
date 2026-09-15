import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OrderQuoteEntity } from './entities/order-quote.entity';
import { OrderQuoteLineEntity } from './entities/order-quote-line.entity';
import { OrderDocumentEntity } from './entities/order-document.entity';
import { ORDER_STATUSES } from './order.types';
import { getPermissions } from 'src/admin/admin.permissions';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import type { AdminRole } from 'src/admin/entities/admin-user-role.entity';
import { AdminUserRoleEntity } from 'src/admin/entities/admin-user-role.entity';
import {
    isEligibleOrderManager,
    orderAssignmentPermissions,
    orderWorkspaceEventMetadata,
} from './order-workspace';

const service = Object.create(OrdersService.prototype) as OrdersService;
function actor(role: AdminRole = 'sales_manager', id = 1): AdminPrincipal {
    return {
        id,
        login: 'synthetic',
        displayName: 'Synthetic',
        roles: [role],
        permissions: getPermissions([role]),
        isActive: true,
        sessionId: 1,
    };
}
function order(status: OrderEntity['status']) {
    return Object.assign(new OrderEntity(), {
        id: 1,
        status,
        assignedManagerId: 1,
        lines: [{}],
        quote: Object.assign(new OrderQuoteEntity(), {
            status:
                status === 'submitted' || status === 'in_review'
                    ? 'draft'
                    : 'confirmed',
            hasUnpricedItems: false,
            quotedPricedSubtotalMinor: '100',
            catalogPricedSubtotalMinor: '100',
            lines: [
                Object.assign(new OrderQuoteLineEntity(), {
                    quantity: 1,
                    quotedUnitPriceMinor: '100',
                    catalogUnitPriceMinor: '100',
                }),
            ],
        }),
        documents:
            status === 'submitted' ||
            status === 'in_review' ||
            status === 'confirmed'
                ? []
                : [
                      Object.assign(new OrderDocumentEntity(), {
                          type: 'invoice',
                          status: 'active',
                      }),
                  ],
        paymentReceivedAt: new Date(),
        paymentConfirmedAt: new Date(),
        paymentConfirmedByStaffId: 1,
        paymentConfirmationSource: 'bank_statement',
        fulfilledAt: status === 'fulfilled' ? new Date() : null,
        fulfilledByStaffId: status === 'fulfilled' ? 1 : null,
        fulfillmentMethod: status === 'fulfilled' ? 'pickup' : null,
        fulfillmentRecipientName: null,
        fulfillmentCarrierName: null,
        fulfillmentTrackingNumber: null,
        fulfillmentComment: null,
        completedAt: null,
        completedByStaffId: null,
        realizationNumber: null,
        realizationDate: null,
        finalDocumentsDeliveryMethod: null,
        finalDocumentKinds: null,
        finalDocumentsDeliveredAt: null,
        completionComment: null,
    });
}
describe('FE-ORD-1 server workspace policy', () => {
    it.each(ORDER_STATUSES)(
        'projects status %s consistently with canonical command stages',
        (status) => {
            const actions = service['workspaceActions'](order(status), actor());
            expect(actions.assign.allowed).toBe(
                !['completed', 'cancelled'].includes(status),
            );
            expect(actions.review.allowed).toBe(
                ['submitted', 'in_review'].includes(status),
            );
            expect(actions.quote.allowed).toBe(status === 'in_review');
            expect(actions.confirm.allowed).toBe(status === 'in_review');
            expect(actions.invoice.allowed).toBe(
                ['confirmed', 'waiting_payment'].includes(status),
            );
            expect(actions.payment.allowed).toBe(status === 'waiting_payment');
            expect(actions.fulfill.allowed).toBe(status === 'paid');
            expect(actions.complete.allowed).toBe(status === 'fulfilled');
        },
    );
    it.each(['operator', 'engineer'] as AdminRole[])(
        'never grants %s Orders actions',
        (role) => {
            expect(
                Object.values(
                    service['workspaceActions'](
                        order('in_review'),
                        actor(role),
                    ),
                ).every(
                    (action) =>
                        !action.allowed && action.reason === 'permission',
                ),
            ).toBe(true);
        },
    );
    it('superadmin still needs assignment for business commands', () => {
        const actions = service['workspaceActions'](
            order('in_review'),
            actor('superadmin', 2),
        );
        expect(actions.assign.allowed).toBe(true);
        expect(actions.quote).toEqual({ allowed: false, reason: 'assignment' });
    });
    it('unassigned submitted order can be taken through review, but another manager cannot take it', () => {
        const row = order('submitted');
        row.assignedManagerId = null;
        expect(service['workspaceActions'](row, actor()).review.allowed).toBe(
            true,
        );
        row.assignedManagerId = 2;
        expect(service['workspaceActions'](row, actor()).review.allowed).toBe(
            false,
        );
    });
    it('unpriced, missing and inconsistent quote facts are not advertised as confirmable', () => {
        const row = order('in_review');
        row.quote.lines[0].quotedUnitPriceMinor = null;
        expect(service['workspaceActions'](row, actor()).confirm.allowed).toBe(
            false,
        );
        row.quote.lines[0].quotedUnitPriceMinor = '101';
        expect(service['workspaceActions'](row, actor()).confirm.allowed).toBe(
            false,
        );
        row.quote = null;
        expect(service['workspaceActions'](row, actor()).quote.allowed).toBe(
            false,
        );
    });
    it('missing invoice/payment/fulfillment facts fail safe', () => {
        const row = order('paid');
        row.documents = [];
        expect(service['workspaceActions'](row, actor()).fulfill.allowed).toBe(
            false,
        );
        const waiting = order('waiting_payment');
        waiting.documents = [];
        expect(
            service['workspaceActions'](waiting, actor()).invoice.allowed,
        ).toBe(false);
        expect(
            service['workspaceActions'](waiting, actor()).payment.allowed,
        ).toBe(false);
        const fulfilled = order('fulfilled');
        fulfilled.paymentConfirmedAt = null;
        expect(
            service['workspaceActions'](fulfilled, actor()).complete.allowed,
        ).toBe(false);
    });
    it.each(ORDER_STATUSES)(
        'uses one status-specific eligibility helper for %s',
        (status) => {
            const target = {
                isActive: true,
                roleAssignments: [
                    Object.assign(new AdminUserRoleEntity(), {
                        role: 'sales_manager',
                    }),
                ],
            };
            expect(isEligibleOrderManager(target, status)).toBe(
                orderAssignmentPermissions(status) !== null,
            );
            expect(
                isEligibleOrderManager({ ...target, isActive: false }, status),
            ).toBe(false);
            expect(
                isEligibleOrderManager(
                    { ...target, roleAssignments: [] },
                    status,
                ),
            ).toBe(false);
        },
    );
    it('whitelists typed event facts instead of arbitrary storage/provider metadata', () => {
        expect(
            orderWorkspaceEventMetadata({
                quoteRevision: 2,
                documentRevision: 3,
                quotedTotalMinor: '99999999999999999999',
                currency: 'RUB',
                objectKey: 'private',
                sha256: 'private',
                metadata: {},
                providerUrl: 'https://example.test/private',
                revision: 'private',
            }),
        ).toEqual({
            quoteRevision: 2,
            documentRevision: 3,
            quotedTotalMinor: '99999999999999999999',
            currency: 'RUB',
        });
        expect(orderWorkspaceEventMetadata(null)).toEqual({});
    });
});
