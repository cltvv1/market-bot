import { MessengerAdminAccessService } from './messenger-admin-access.service';

describe('MessengerAdminAccessService', () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const repository = { find: jest.fn() };
    const service = new MessengerAdminAccessService(
        repository as never,
        audit as never,
    );

    beforeEach(() => jest.clearAllMocks());

    function admin(
        role: 'operator' | 'engineer' | 'sales_manager' | 'superadmin',
        isActive = true,
    ) {
        return {
            id: 7,
            isActive,
            roleAssignments: [{ role }],
        };
    }

    it.each([
        ['operator', 'tickets.reply'],
        ['engineer', 'serviceRequests.read.assigned'],
        ['superadmin', 'staff.roles.manage'],
    ] as const)('allows %s for its permission', async (role, permission) => {
        repository.find.mockResolvedValue([admin(role)]);

        await expect(
            service.authorize('telegram', '10', permission, {
                action: 'test.action',
                targetType: 'ticket',
                targetId: 4,
            }),
        ).resolves.toMatchObject({ id: 7 });
    });

    it.each([
        ['sales_manager', 'tickets.reply'],
        ['engineer', 'tickets.reply'],
        ['operator', 'staff.roles.manage'],
    ] as const)(
        'denies %s without the permission',
        async (role, permission) => {
            repository.find.mockResolvedValue([admin(role)]);

            await expect(
                service.authorize('telegram', '10', permission, {
                    action: 'test.action',
                    targetType: 'ticket',
                }),
            ).resolves.toBeNull();
            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    result: 'denied',
                    reason: 'insufficient_permission',
                }),
            );
        },
    );

    it.each([
        ['unbound', []],
        ['deleted', []],
        ['inactive', [admin('operator', false)]],
    ])('denies %s staff binding', async (_case, result) => {
        repository.find.mockResolvedValue(result);

        await expect(
            service.authorize('max', '20', 'tickets.reply', {
                action: 'test.action',
                targetType: 'ticket',
            }),
        ).resolves.toBeNull();
        expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
                result: 'denied',
                reason: 'inactive_or_unbound_staff',
            }),
        );
    });

    it('fails closed when a chat is linked to multiple staff records', async () => {
        repository.find.mockResolvedValue([
            admin('operator'),
            admin('superadmin'),
        ]);

        await expect(
            service.findAuthorizedStaff('telegram', '10', 'tickets.reply'),
        ).resolves.toBeNull();
    });
});
