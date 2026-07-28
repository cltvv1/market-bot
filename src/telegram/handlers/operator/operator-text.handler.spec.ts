import { OperatorTextHandler } from './operator-text.handler';

describe('OperatorTextHandler', () => {
    const users = {
        getTalkingTo: jest.fn(),
    };
    const contexts = { set: jest.fn().mockResolvedValue(undefined) };
    const tickets = { getActiveTicket: jest.fn() };
    const access = { findAuthorizedStaff: jest.fn() };
    const handler = new OperatorTextHandler(
        users as never,
        contexts as never,
        tickets as never,
        access as never,
    );
    const ctx = {
        chat: { id: 10 },
        reply: jest.fn().mockResolvedValue(undefined),
        copyMessage: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => jest.clearAllMocks());

    it('forwards when the reciprocal active chat context is valid', async () => {
        users.getTalkingTo.mockImplementation((id: string) =>
            Promise.resolve(id === '10' ? '20' : '10'),
        );
        access.findAuthorizedStaff.mockImplementation(
            (_platform: string, id: string) =>
                Promise.resolve(id === '10' ? { id: 1 } : null),
        );
        tickets.getActiveTicket.mockResolvedValue({ id: 5 });

        await handler.handle(ctx as never);

        expect(ctx.copyMessage).toHaveBeenCalledWith('20', expect.anything());
    });

    it.each([
        ['missing context', null, null, null],
        ['stale target', '20', '99', { id: 5 }],
        ['closed ticket', '20', '10', null],
    ])('fails closed for %s', async (_case, target, reciprocal, ticket) => {
        users.getTalkingTo.mockImplementation((id: string) =>
            Promise.resolve(id === '10' ? target : reciprocal),
        );
        access.findAuthorizedStaff.mockResolvedValue({ id: 1 });
        tickets.getActiveTicket.mockResolvedValue(ticket);

        await handler.handle(ctx as never);

        expect(ctx.copyMessage).not.toHaveBeenCalled();
        expect(contexts.set).toHaveBeenCalledWith('10', { mode: 'IDLE' });
    });

    it('rejects a chat whose staff member was deactivated', async () => {
        users.getTalkingTo.mockImplementation((id: string) =>
            Promise.resolve(id === '10' ? '20' : '10'),
        );
        access.findAuthorizedStaff.mockResolvedValue(null);
        tickets.getActiveTicket.mockResolvedValue({ id: 5 });

        await handler.handle(ctx as never);

        expect(ctx.copyMessage).not.toHaveBeenCalled();
    });
});
