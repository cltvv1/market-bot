import { TicketsService } from './tickets.service';
import { TicketMessageEntity } from './entities/ticket-message.entity';

describe('TicketsService media persistence', () => {
    interface FileInput {
        purpose: string;
        buffer: Buffer;
    }
    const createMessage = jest.fn(
        (value: Partial<TicketMessageEntity>): TicketMessageEntity =>
            value as TicketMessageEntity,
    );
    const saveMessage = jest.fn(
        (value: TicketMessageEntity): Promise<TicketMessageEntity> =>
            Promise.resolve(Object.assign(value, { id: 12 })),
    );
    const messages = {
        create: createMessage,
        save: saveMessage,
    };
    const files = {
        saveBuffer: jest.fn((_input: FileInput): Promise<{ id: number }> => {
            void _input;
            return Promise.resolve({ id: 44 });
        }),
    };
    const service = new TicketsService(
        {} as never,
        messages as never,
        {} as never,
        {} as never,
        files as never,
        {} as never,
        {} as never,
    );

    beforeEach(() => jest.clearAllMocks());

    it('links a materialized MAX attachment to StoredFile without retaining its URL', async () => {
        const saved = await service.addMediaMessage(
            8,
            'user',
            {
                messageType: 'document',
                fileId: 'max-provider-id',
                fileName: 'document.pdf',
                mimeType: 'application/pdf',
                buffer: Buffer.from('%PDF- test'),
            },
            '55',
        );

        expect(files.saveBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                purpose: 'ticket-document',
            }),
        );
        const fileInput = files.saveBuffer.mock.calls[0][0];
        expect(Buffer.isBuffer(fileInput.buffer)).toBe(true);
        expect(saved).toMatchObject({
            ticketId: 8,
            storedFileId: 44,
        });
        expect(JSON.stringify(saved)).not.toContain('token=');
    });
});
