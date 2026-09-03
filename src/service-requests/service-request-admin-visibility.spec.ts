import { SERVICE_REQUEST_ADMIN_VISIBLE_SQL } from './service-request-admin-visibility';

describe('canonical admin-worthy ServiceRequest visibility', () => {
    it('keeps the trusted alias, grouped OR and exact legacy null semantics', () => {
        expect(SERVICE_REQUEST_ADMIN_VISIBLE_SQL.replace(/\s+/g, ' ')).toBe(
            "(request.status <> 'draft' OR request.currentStep > 0 OR request.assignedEngineerId IS NOT NULL OR request.responsibleOperatorStaffId IS NOT NULL OR request.operatorComment IS NOT NULL)",
        );
    });
});
