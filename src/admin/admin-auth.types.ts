import type { AdminPermission } from './admin.permissions';
import type { AdminRole } from './entities/admin-user-role.entity';

export interface AdminPrincipal {
    id: number;
    login: string;
    displayName: string;
    roles: AdminRole[];
    permissions: AdminPermission[];
    isActive: boolean;
    sessionId: number;
}
