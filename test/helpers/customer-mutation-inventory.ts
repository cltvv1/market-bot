// An explicit review boundary, checked against all registered Nest controllers.
export const customerMutationInventory: Record<
    string,
    ReadonlyArray<readonly [string, string, string, boolean]>
> = {
    WebSessionController: [
        ['createOrRestore', 'POST', '/api/client/session', false],
        ['revoke', 'POST', '/api/client/session/revoke', false],
    ],
    AssetsController: [
        [
            'upsertCashRegister',
            'POST',
            '/api/client/organizations/:organizationId/assets/cash-registers',
            false,
        ],
        [
            'upsertFiscalDrive',
            'POST',
            '/api/client/organizations/:organizationId/assets/fiscal-drives',
            false,
        ],
        [
            'upsertOfdSubscription',
            'POST',
            '/api/client/organizations/:organizationId/assets/ofd-subscriptions',
            false,
        ],
    ],
    OrganizationsController: [
        ['linkByInn', 'POST', '/api/client/organizations/link-by-inn', false],
        [
            'cancelAccessRequest',
            'POST',
            '/api/client/organizations/access-requests/:id/cancel',
            false,
        ],
    ],
    ClientApiController: [
        ['upsertUser', 'POST', '/api/client/users', false],
        ['startRegistration', 'POST', '/api/client/registrations/start', true],
        [
            'submitRegistrationAnswer',
            'POST',
            '/api/client/registrations/answer',
            true,
        ],
        [
            'submitRegistrationForm',
            'POST',
            '/api/client/registrations/form',
            true,
        ],
        [
            'provideRegistrationValue',
            'POST',
            '/api/client/registrations/:id/requirements/:kind/value',
            true,
        ],
        [
            'provideRegistrationEvidence',
            'POST',
            '/api/client/registrations/:id/requirements/:kind/evidence',
            true,
        ],
        ['openTicket', 'POST', '/api/client/tickets/open', false],
        ['submitTicketMessage', 'POST', '/api/client/tickets/messages', false],
        ['submitTicketMedia', 'POST', '/api/client/tickets/media', false],
        [
            'submitTicketMessageAlias',
            'POST',
            '/api/client/tickets/:id/messages',
            false,
        ],
    ],
    RegistrationClientController: [
        ['create', 'POST', '/api/client/registrations/drafts', true],
        ['save', 'PATCH', '/api/client/registrations/:id/draft', true],
        ['submit', 'POST', '/api/client/registrations/:id/submit', true],
    ],
    ServiceRequestsController: [
        ['createDraft', 'POST', '/api/client/service-requests/drafts', true],
        [
            'updateDraft',
            'PATCH',
            '/api/client/service-requests/drafts/:id',
            true,
        ],
        [
            'submitDraft',
            'POST',
            '/api/client/service-requests/drafts/:id/submit',
            true,
        ],
        [
            'addAttachment',
            'POST',
            '/api/client/service-requests/drafts/:id/attachments',
            true,
        ],
        [
            'removeAttachment',
            'DELETE',
            '/api/client/service-requests/drafts/:id/attachments/:attachmentId',
            true,
        ],
        [
            'uploadPaymentProof',
            'POST',
            '/api/client/service-requests/:id/payment-proof',
            true,
        ],
        [
            'addMessage',
            'POST',
            '/api/client/service-requests/:id/messages',
            true,
        ],
        [
            'addMessageAttachment',
            'POST',
            '/api/client/service-requests/:id/messages/attachments',
            true,
        ],
    ],
    ClientOrdersController: [
        ['submit', 'POST', '/api/client/orders', true],
        [
            'uploadPaymentProof',
            'POST',
            '/api/client/orders/:id/payment-proofs',
            true,
        ],
    ],
} as const;

export const exemptMutationInventory: Record<
    string,
    ReadonlyArray<readonly [string, string, string]>
> = {
    PublicCatalogController: [
        ['resolve', 'POST', '/api/catalog/products/resolve'],
    ],
    PublicServiceRequestsController: [
        ['addMessage', 'POST', '/api/public/service-requests/:token/messages'],
        [
            'addMessageAttachment',
            'POST',
            '/api/public/service-requests/:token/messages/attachments',
        ],
    ],
} as const;

export const excludedMutationCounts: Record<string, number> = {
    AdminController: 35,
    AdminCatalogController: 8,
    AdminOrdersController: 8,
    AdminKnowledgeController: 4,
    AdminSupportController: 14,
    AdminIntegrationsController: 5,
    IntegrationsController: 1,
};

export const multipartCustomerRoutes = [
    '/api/client/tickets/media',
    '/api/client/registrations/:id/requirements/:kind/evidence',
    '/api/client/service-requests/drafts/:id/attachments',
    '/api/client/service-requests/:id/payment-proof',
    '/api/client/service-requests/:id/messages/attachments',
    '/api/client/orders/:id/payment-proofs',
] as const;
