import { serviceButtons } from './keyboards/service.keyboard';
import { TelegramUpdate } from './telegram.update';

describe('TelegramUpdate admin callbacks', () => {
    const registrations = {
        getRegistrationById: jest.fn(),
        doReg: jest.fn().mockResolvedValue(undefined),
        notifyAdminsAboutRegDone: jest.fn().mockResolvedValue(undefined),
    };
    const contexts = { set: jest.fn().mockResolvedValue(undefined) };
    const tickets = { getActiveTicket: jest.fn() };
    const users = {};
    const clientWorkflow = { openTicket: jest.fn() };
    const access = {
        authorize: jest.fn(),
        recordSuccess: jest.fn().mockResolvedValue(undefined),
        recordInvalid: jest.fn().mockResolvedValue(undefined),
    };
    const update = new TelegramUpdate(
        registrations as never,
        contexts as never,
        tickets as never,
        users as never,
        clientWorkflow as never,
        {} as never,
        {} as never,
        {} as never,
        access as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    const ctx = {
        from: { id: 100 },
        chat: { id: 100 },
        callbackQuery: { data: 'regDone:42' },
        message: { message_id: 3 },
        reply: jest.fn().mockResolvedValue(undefined),
        deleteMessage: jest.fn().mockResolvedValue(undefined),
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageText: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => jest.clearAllMocks());

    it('allows an authorized operator callback and records success', async () => {
        access.authorize.mockResolvedValue({ id: 1 });
        registrations.getRegistrationById.mockResolvedValue({ id: 42 });

        await update.onRegDone(ctx as never);

        expect(registrations.doReg).toHaveBeenCalledWith({ id: 42 });
        expect(access.recordSuccess).toHaveBeenCalledWith(
            { id: 1 },
            'telegram',
            expect.objectContaining({ targetId: '42' }),
        );
    });

    it('denies an unbound client before any business mutation', async () => {
        access.authorize.mockResolvedValue(null);

        await update.onRegDone(ctx as never);

        expect(registrations.getRegistrationById).not.toHaveBeenCalled();
        expect(registrations.doReg).not.toHaveBeenCalled();
        expect(ctx.reply).toHaveBeenCalledWith('Недостаточно прав');
    });

    it('rejects a forged or stale target without a business mutation', async () => {
        access.authorize.mockResolvedValue({ id: 1 });
        registrations.getRegistrationById.mockResolvedValue(null);

        await update.onRegDone(ctx as never);

        expect(registrations.doReg).not.toHaveBeenCalled();
        expect(access.recordInvalid).toHaveBeenCalledWith(
            { id: 1 },
            'telegram',
            expect.objectContaining({ targetId: '42' }),
            'invalid_or_stale_target',
        );
    });

    it('routes the existing OFD callback to the operator ticket workflow', async () => {
        clientWorkflow.openTicket.mockResolvedValue({ status: 'started' });

        await update.onWantToOfd(ctx as never);

        expect(ctx.answerCbQuery).toHaveBeenCalled();
        expect(clientWorkflow.openTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                platform: 'telegram',
                chatId: '100',
            }),
        );
        expect(contexts.set).toHaveBeenCalledWith('100', { mode: 'TICKET' });
    });

    it('renders the OFD button with the callback recognized by the handler', () => {
        const keyboard = serviceButtons() as {
            reply_markup: {
                inline_keyboard: Array<Array<{ callback_data: string }>>;
            };
        };
        const callbacks = keyboard.reply_markup.inline_keyboard
            .flat()
            .map((button) => button.callback_data);
        expect(callbacks).toContain('wantToOfd');
    });
});
