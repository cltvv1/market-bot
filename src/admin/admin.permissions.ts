import type { AdminRole } from './entities/admin-user-role.entity';

export const ADMIN_PERMISSIONS = [
    'staff.read',
    'staff.create',
    'staff.update',
    'staff.roles.manage',
    'staff.sessions.revoke',
    'registrations.read',
    'registrations.update',
    'tickets.read',
    'tickets.reply',
    'tickets.close',
    'serviceRequests.read.all',
    'serviceRequests.read.assigned',
    'serviceRequests.assign',
    'serviceRequests.update',
    'serviceRequests.invoice',
    'serviceRequests.payment',
    'serviceRequests.schedule',
    'serviceRequests.close',
    'organizations.read',
    'organizations.update',
    'assets.read',
    'assets.update',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const OPERATOR_PERMISSIONS: AdminPermission[] = [
    'staff.read',
    'registrations.read',
    'registrations.update',
    'tickets.read',
    'tickets.reply',
    'tickets.close',
    'serviceRequests.read.all',
    'serviceRequests.assign',
    'serviceRequests.update',
    'serviceRequests.invoice',
    'serviceRequests.payment',
    'serviceRequests.schedule',
    'serviceRequests.close',
    'organizations.read',
    'organizations.update',
    'assets.read',
    'assets.update',
];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
    operator: OPERATOR_PERMISSIONS,
    engineer: ['serviceRequests.read.assigned'],
    sales_manager: [],
    superadmin: ADMIN_PERMISSIONS,
};

export function getPermissions(roles: readonly AdminRole[]) {
    return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}
