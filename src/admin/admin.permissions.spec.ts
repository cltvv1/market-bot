import { getPermissions } from './admin.permissions';

describe('admin permissions', () => {
    it('combines permissions for multiple roles', () => {
        const permissions = getPermissions(['operator', 'sales_manager']);
        expect(permissions).toContain('registrations.read');
        expect(permissions).toContain('serviceRequests.assign');
    });

    it('grants catalog permissions but not service permissions to sales manager', () => {
        expect(getPermissions(['sales_manager'])).toEqual([
            'catalog.read',
            'catalog.manage',
            'orders.read.all',
            'orders.assign',
            'orders.review',
            'orders.quote',
            'orders.confirm',
            'orders.invoice',
            'orders.payment',
            'support.read',
            'support.manage',
            'knowledge.read',
            'knowledge.manage',
        ]);
        expect(getPermissions(['sales_manager'])).not.toContain(
            'serviceRequests.read.all',
        );
    });

    it('grants every permission to superadmin', () => {
        expect(getPermissions(['superadmin'])).toContain('staff.roles.manage');
        expect(getPermissions(['superadmin'])).toContain(
            'serviceRequests.close',
        );
        expect(getPermissions(['superadmin'])).toContain('catalog.manage');
        expect(getPermissions(['superadmin'])).toContain('orders.read.all');
        expect(getPermissions(['superadmin'])).toContain('orders.confirm');
        expect(getPermissions(['superadmin'])).toContain('orders.invoice');
        expect(getPermissions(['superadmin'])).toContain('orders.payment');
        expect(getPermissions(['superadmin'])).toContain('support.manage');
        expect(getPermissions(['superadmin'])).toContain('knowledge.manage');
    });
});
