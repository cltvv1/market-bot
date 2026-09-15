import type { AdminPermission } from 'src/admin/admin.permissions';
import { getPermissions } from 'src/admin/admin.permissions';
import type { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import type { OrderStatus } from './order.types';

export function orderAssignmentPermissions(
    status: OrderStatus,
): AdminPermission[] | null {
    if (status === 'submitted' || status === 'in_review')
        return ['orders.review'];
    if (status === 'confirmed' || status === 'waiting_payment')
        return ['orders.invoice', 'orders.payment'];
    if (status === 'paid') return ['orders.fulfill'];
    if (status === 'fulfilled') return ['orders.complete'];
    return null;
}

export function isEligibleOrderManager(
    target: Pick<AdminUserEntity, 'isActive' | 'roleAssignments'>,
    status: OrderStatus,
) {
    const required = orderAssignmentPermissions(status);
    const permissions = getPermissions(
        target.roleAssignments.map((assignment) => assignment.role),
    );
    return (
        target.isActive &&
        required !== null &&
        permissions.includes('orders.read.all') &&
        required.every((permission) => permissions.includes(permission))
    );
}

// Only typed business facts are projected, never arbitrary historical metadata.
export function orderWorkspaceEventMetadata(
    metadata: Record<string, unknown> | null,
) {
    const result: Record<string, string | number> = {};
    for (const key of [
        'quoteRevision',
        'invoiceRevision',
        'documentRevision',
        'revision',
        'lineCount',
        'managerId',
        'previousManagerId',
    ]) {
        const value = metadata?.[key];
        if (
            typeof value === 'number' &&
            Number.isSafeInteger(value) &&
            value >= 0
        )
            result[key] = value;
    }
    for (const key of ['quotedTotalMinor', 'amountMinor']) {
        const value = metadata?.[key];
        if (typeof value === 'string' && /^\d{1,20}$/.test(value))
            result[key] = value;
    }
    if (metadata?.currency === 'RUB') result.currency = 'RUB';
    return result;
}
