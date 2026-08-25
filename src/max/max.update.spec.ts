import {
    MAX_BOT_COMMANDS,
    MAX_OFD_CALLBACK,
    MaxUpdate,
    registerMaxBotCommands,
} from './max.update';
import type { TicketMediaInput } from 'src/tickets/tickets.service';

describe('MaxUpdate media handling', () => {
    const enqueueOperatorMedia = jest.fn(
        (
            _ticketId: number,
            _media: TicketMediaInput,
            _authorId: string,
            _source: string,
            _keyboard: unknown,
        ): Promise<void> => {
            void [_ticketId, _media, _authorId, _source, _keyboard];
            return Promise.resolve();
        },
    );
    const tickets = {
        getActiveTicket: jest.fn(),
        enqueueOperatorMedia,
    };
    const users = {
        getTalkingTo: jest.fn((chatId: string) =>
            Promise.resolve(chatId === '55' ? '77' : '55'),
        ),
    };
    const access = {
        findAuthorizedStaff: jest.fn((_platform: string, chatId: string) =>
            Promise.resolve(chatId === '55' ? { id: 1 } : null),
        ),
    };
    const contexts = { set: jest.fn().mockResolvedValue(undefined) };
    const clientWorkflow = {
        upsertClient: jest.fn().mockResolvedValue(undefined),
        submitTicketMedia: jest.fn().mockResolvedValue({ status: 'completed' }),
        submitServiceRequestPaymentProof: jest
            .fn()
            .mockResolvedValue({ status: 'completed' }),
        openTicket: jest.fn().mockResolvedValue({ status: 'started' }),
    };
    const serviceRequests = {
        getLatestWaitingPaymentForClient: jest.fn(),
    };
    const files = {
        getPolicy: jest.fn().mockReturnValue({ maxBytes: 1024 }),
    };
    const messenger = {
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sendImage: jest.fn().mockResolvedValue(undefined),
        sendDocument: jest.fn().mockResolvedValue(undefined),
    };
    const inboundCommands = {
        execute: jest.fn(async (_input, handler: () => Promise<unknown>) => ({
            status: 'processed' as const,
            command: {},
            result: await handler(),
        })),
    };
    const update = new MaxUpdate(
        { get: jest.fn().mockReturnValue(false) } as never,
        {} as never,
        tickets as never,
        contexts as never,
        users as never,
        clientWorkflow as never,
        serviceRequests as never,
        {} as never,
        files as never,
        access as never,
        messenger,
        inboundCommands as never,
    );
    const ctx = {
        chatId: 55,
        user: { first_name: 'Client' },
        reply: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        tickets.getActiveTicket.mockResolvedValue({ id: 8 });
        serviceRequests.getLatestWaitingPaymentForClient.mockResolvedValue(
            null,
        );
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])),
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('persists customer media as a buffer without a provider URL', async () => {
        await update.handleMaxMedia(ctx, 'TICKET', {
            messageType: 'image',
            fileId: 'provider-photo',
            externalUrl: 'https://media.test/secret-reference',
        });

        expect(clientWorkflow.submitTicketMedia).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'max', chatId: '55' }),
            expect.objectContaining({
                buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
                externalUrl: undefined,
            }),
        );
    });

    it('attaches customer media to the latest request awaiting payment', async () => {
        serviceRequests.getLatestWaitingPaymentForClient.mockResolvedValue({
            id: 10,
        });

        await update.handleMaxMedia(ctx, 'IDLE', {
            messageType: 'image',
            fileId: 'payment-photo',
            externalUrl: 'https://media.test/payment',
        });

        // prettier-ignore
        expect(
            clientWorkflow.submitServiceRequestPaymentProof,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'max', chatId: '55' }),
            expect.objectContaining({
                buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
                fileName: 'image.jpg',
            }),
        );
        expect(tickets.getActiveTicket).not.toHaveBeenCalled();
    });

    it('routes the MAX OFD callback to the existing operator ticket workflow', async () => {
        expect(MAX_OFD_CALLBACK).toBe('wantToOfd');

        await update.handleOfdRequest(ctx);

        expect(clientWorkflow.openTicket).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'max', chatId: '55' }),
        );
        expect(contexts.set).toHaveBeenCalledWith(
            '55',
            { mode: 'TICKET' },
            'max',
        );
    });

    it('registers the supported MAX commands through the SDK', async () => {
        const setMyCommands = jest.fn().mockResolvedValue({
            commands: MAX_BOT_COMMANDS,
        });

        await registerMaxBotCommands({ setMyCommands });

        expect(setMyCommands).toHaveBeenCalledWith([
            { name: 'start', description: 'Запустить бота' },
            { name: 'menu', description: 'Открыть главное меню' },
        ]);
    });

    it('opens the main menu command and resets an active flow', async () => {
        await update.handleMainMenuCommand(ctx);

        expect(clientWorkflow.upsertClient).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'max', chatId: '55' }),
        );
        expect(contexts.set).toHaveBeenCalledWith(
            '55',
            { mode: 'IDLE' },
            'max',
        );
        expect(ctx.reply).toHaveBeenCalledWith(
            'Я чат-бот компании ВитмаМаркет. Чем могу помочь?',
            expect.anything(),
        );
    });

    it('activates a persistent registration data request by opaque token', async () => {
        const readiness = {
            activateRequest: jest.fn().mockResolvedValue({ id: 9 }),
        };
        const handler = new MaxUpdate(
            { get: jest.fn().mockReturnValue(false) } as never,
            {} as never,
            tickets as never,
            contexts as never,
            users as never,
            clientWorkflow as never,
            serviceRequests as never,
            {} as never,
            files as never,
            access as never,
            messenger,
            inboundCommands as never,
            readiness as never,
        );
        const requestCtx = {
            ...ctx,
            answerOnCallback: jest.fn().mockResolvedValue(undefined),
        };
        const token = '11111111-1111-4111-8111-111111111111';

        await handler.activateRegistrationDataRequest(requestCtx, token);

        expect(readiness.activateRequest).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'max', chatId: '55' }),
            token,
        );
        expect(requestCtx.answerOnCallback).toHaveBeenCalledWith({
            notification: 'Запрос выбран',
        });
    });

    it('sends supported operator images as binary media', async () => {
        await update.handleMaxMedia(ctx, 'OPERATOR', {
            messageType: 'image',
            fileId: 'provider-photo',
            externalUrl: 'https://media.test/photo',
        });

        expect(tickets.enqueueOperatorMedia).toHaveBeenCalledWith(
            8,
            expect.objectContaining({
                externalUrl: undefined,
            }),
            '55',
            'bot',
            expect.anything(),
        );
        expect(
            Buffer.isBuffer(enqueueOperatorMedia.mock.calls[0][1].buffer),
        ).toBe(true);
        expect(messenger.sendImage).not.toHaveBeenCalled();
        expect(messenger.sendDocument).not.toHaveBeenCalled();
        expect(messenger.sendMessage).not.toHaveBeenCalled();
    });

    it('does not call the provider while queuing operator media', async () => {
        await update.handleMaxMedia(ctx, 'OPERATOR', {
            messageType: 'document',
            fileId: 'provider-document',
            externalUrl: 'https://media.test/document',
        });

        expect(tickets.enqueueOperatorMedia).toHaveBeenCalledWith(
            8,
            expect.objectContaining({
                buffer: expect.any(Buffer) as unknown,
            }),
            '55',
            'bot',
            expect.anything(),
        );
        expect(messenger.sendMessage).not.toHaveBeenCalled();
    });

    it('rejects unsupported operator media without sending or persisting it', async () => {
        await update.handleMaxMedia(ctx, 'OPERATOR', {
            messageType: 'audio',
            fileId: 'provider-audio',
            externalUrl: 'https://media.test/audio',
        });

        expect(tickets.enqueueOperatorMedia).not.toHaveBeenCalled();
        expect(messenger.sendImage).not.toHaveBeenCalled();
        expect(messenger.sendDocument).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
