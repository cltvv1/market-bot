import { serviceButtons } from './keyboards/service.keyboard';
import { TelegramUpdate } from './telegram.update';
import { STALE_SERVICE_REQUEST_CALLBACK_MESSAGE } from 'src/inbound-commands/service-request-callback';
import { StaleServiceRequestChannelCommandException } from 'src/service-requests/service-request-channel-workflow.service';

describe('TelegramUpdate admin callbacks', () => {
    const registrations = {
        getRegistrationById: jest.fn(),
        doReg: jest.fn().mockResolvedValue(undefined),
        notifyAdminsAboutRegDone: jest.fn().mockResolvedValue(undefined),
    };
    const contexts = {
        get: jest.fn().mockResolvedValue({ mode: 'IDLE' }),
        set: jest.fn().mockResolvedValue(undefined),
    };
    const tickets = { getActiveTicket: jest.fn() };
    const users = {};
    const clientWorkflow = {
        openTicket: jest.fn(),
        submitServiceRequestPaymentProof: jest.fn(),
    };
    const serviceRequests = {
        getLatestWaitingPaymentForClient: jest.fn(),
        answer: jest.fn(),
    };
    const files = {
        getPolicy: jest.fn().mockReturnValue({ maxBytes: 20 * 1024 * 1024 }),
    };
    const access = {
        authorize: jest.fn(),
        recordSuccess: jest.fn().mockResolvedValue(undefined),
        recordInvalid: jest.fn().mockResolvedValue(undefined),
    };
    const inboundCommands = {
        execute: jest.fn(async (_input, handler: () => Promise<unknown>) => ({
            status: 'processed' as const,
            command: {},
            result: await handler(),
        })),
    };
    const update = new TelegramUpdate(
        registrations as never,
        contexts as never,
        tickets as never,
        users as never,
        clientWorkflow as never,
        serviceRequests as never,
        {} as never,
        files as never,
        access as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        inboundCommands as never,
    );
    const ctx = {
        update: { update_id: 1001 },
        from: { id: 100 },
        chat: { id: 100 },
        callbackQuery: { data: 'regDone:42' },
        message: { message_id: 3 },
        reply: jest.fn().mockResolvedValue(undefined),
        deleteMessage: jest.fn().mockResolvedValue(undefined),
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageText: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        serviceRequests.getLatestWaitingPaymentForClient.mockResolvedValue(
            null,
        );
    });

    it('allows an authorized operator callback and records success', async () => {
        access.authorize.mockResolvedValue({ id: 1 });
        registrations.getRegistrationById.mockResolvedValue({ id: 42 });

        await update.onRegDone(ctx as never);

        expect(registrations.doReg).toHaveBeenCalledWith({ id: 42 }, 1);
        expect(access.recordSuccess).toHaveBeenCalledWith(
            { id: 1 },
            'telegram',
            expect.objectContaining({ targetId: '42' }),
        );
    });

    it('activates a persistent registration data request by opaque token', async () => {
        const readiness = {
            activateRequest: jest.fn().mockResolvedValue({ id: 9 }),
        };
        const handler = new TelegramUpdate(
            registrations as never,
            contexts as never,
            tickets as never,
            users as never,
            clientWorkflow as never,
            serviceRequests as never,
            {} as never,
            files as never,
            access as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            inboundCommands as never,
            readiness as never,
        );
        const token = '11111111-1111-4111-8111-111111111111';
        const requestCtx = {
            ...ctx,
            callbackQuery: { data: `regdata:${token}` },
        };

        await handler.activateRegistrationDataRequest(requestCtx as never);

        expect(readiness.activateRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                platform: 'telegram',
                chatId: '100',
            }),
            token,
        );
        expect(requestCtx.answerCbQuery).toHaveBeenCalledWith('Запрос выбран');
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

    it('attaches a customer document to the latest request awaiting payment', async () => {
        serviceRequests.getLatestWaitingPaymentForClient.mockResolvedValue({
            id: 10,
        });
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(Buffer.from('%PDF-1.7 payment')),
        );
        const mediaCtx = {
            update: { update_id: 1002 },
            from: { id: 100, first_name: 'Client' },
            chat: { id: 100 },
            message: {
                document: {
                    file_id: 'payment-document',
                    file_unique_id: 'payment-document-unique',
                    file_name: 'payment.pdf',
                    mime_type: 'application/pdf',
                    file_size: 1024,
                },
            },
            telegram: {
                getFileLink: jest
                    .fn()
                    .mockResolvedValue(new URL('https://media.test/payment')),
            },
            reply: jest.fn().mockResolvedValue(undefined),
        };

        await update.handleMessage(mediaCtx as never);

        expect(
            clientWorkflow.submitServiceRequestPaymentProof,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'telegram', chatId: '100' }),
            expect.objectContaining({
                buffer: Buffer.from('%PDF-1.7 payment'),
                fileName: 'payment.pdf',
                mimeType: 'application/pdf',
            }),
        );
        expect(tickets.getActiveTicket).not.toHaveBeenCalled();

        jest.restoreAllMocks();
    });

    it('rejects a replayed service-request callback without changing dialog state', async () => {
        serviceRequests.answer.mockRejectedValue(
            new StaleServiceRequestChannelCommandException(),
        );
        const callbackCtx = {
            ...ctx,
            update: { update_id: 1003 },
            callbackQuery: {
                id: 'callback-stale-1',
                data: 'sra2:42:2:7:36',
            },
        };

        await update.onServiceRequestButtonAnswer(callbackCtx as never);

        expect(serviceRequests.answer).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'telegram', chatId: '100' }),
            42,
            '36',
            { expectedStep: 2, expectedVersion: 7 },
        );
        expect(contexts.set).not.toHaveBeenCalled();
        expect(callbackCtx.answerCbQuery).toHaveBeenCalledWith(
            STALE_SERVICE_REQUEST_CALLBACK_MESSAGE,
        );
    });
});
