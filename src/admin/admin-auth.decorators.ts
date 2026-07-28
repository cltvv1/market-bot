import {
    createParamDecorator,
    ExecutionContext,
    SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPermission } from './admin.permissions';
import type { AdminPrincipal } from './admin-auth.types';

export const ADMIN_PUBLIC_KEY = 'admin:public';
export const ADMIN_PERMISSIONS_KEY = 'admin:permissions';
export const ADMIN_ANY_PERMISSION_KEY = 'admin:any-permission';

export const PublicAdmin = () => SetMetadata(ADMIN_PUBLIC_KEY, true);
export const RequirePermissions = (...permissions: AdminPermission[]) =>
    SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);
export const RequireAnyPermission = (...permissions: AdminPermission[]) =>
    SetMetadata(ADMIN_ANY_PERMISSION_KEY, permissions);

export const CurrentAdmin = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AdminPrincipal => {
        const request = context
            .switchToHttp()
            .getRequest<Request & { admin: AdminPrincipal }>();
        return request.admin;
    },
);
