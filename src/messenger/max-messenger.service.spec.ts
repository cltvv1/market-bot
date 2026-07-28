import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { MaxMessengerService } from './max-messenger.service';

describe('MaxMessengerService', () => {
    it('uploads a document under its customer-facing filename and removes the temporary file', async () => {
        const service = new MaxMessengerService({
            get: jest.fn().mockReturnValue('test-token'),
        } as unknown as ConfigService);
        let uploadedPath = '';
        const uploadFile = jest.fn().mockImplementation(
            async ({ source }: { source: string }) => {
                uploadedPath = source;
                expect(path.basename(source)).toBe('счет.pdf');
                expect(await fs.promises.readFile(source)).toEqual(
                    Buffer.from('%PDF-1.3 test'),
                );
                return {
                    toJson: () => ({
                        type: 'file',
                        payload: { token: 'file-token' },
                    }),
                };
            },
        );
        const sendMessageToChat = jest.fn().mockResolvedValue({ ok: true });
        (service as unknown as { bot: unknown }).bot = {
            api: { uploadFile, sendMessageToChat },
        };

        await service.sendDocument(
            123,
            {
                source: Readable.from(Buffer.from('%PDF-1.3 test')),
                filename: '../счет.pdf',
            },
            { caption: 'Счет готов' },
        );

        expect(uploadFile).toHaveBeenCalledTimes(1);
        expect(sendMessageToChat).toHaveBeenCalledWith(
            123,
            'Счет готов',
            {
                attachments: [
                    {
                        type: 'file',
                        payload: { token: 'file-token' },
                    },
                ],
            },
        );
        await expect(fs.promises.access(uploadedPath)).rejects.toThrow();
    });
});
