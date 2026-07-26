import { getPermissions } from './admin.permissions';

describe('admin permissions', () => {
    it('combines permissions for multiple roles', () => {
        const permissions = getPermissions(['operator', 'sales_manager']);
        expect(permissions).toContain('registrations.read');
        expect(permissions).toContain('serviceRequests.assign');
    });

    it('does not grant service permissions to sales manager', () => {
        expect(getPermissions(['sales_manager'])).toEqual([]);
    });

    it('grants every permission to superadmin', () => {
        expect(getPermissions(['superadmin'])).toContain('staff.roles.manage');
        expect(getPermissions(['superadmin'])).toContain(
            'serviceRequests.close',
        );
    });
});
