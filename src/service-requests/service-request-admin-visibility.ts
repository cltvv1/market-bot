// Both admin list consumers use the trusted, fixed query-builder alias `request`.
export const SERVICE_REQUEST_ADMIN_VISIBLE_SQL = `(request.status <> 'draft'
    OR request.currentStep > 0
    OR request.assignedEngineerId IS NOT NULL
    OR request.responsibleOperatorStaffId IS NOT NULL
    OR request.operatorComment IS NOT NULL)`;
