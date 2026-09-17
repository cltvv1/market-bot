import { ConfigService } from '@nestjs/config';
import { assertFilePolicy } from './file-policies';
import { FilesService } from './files.service';
import type { FilePurpose } from './file-storage.types';

describe('SEC-007 content boundary', () => {
    const cases: [FilePurpose, string, string][] = [
        ['registration-photo', 'image/jpeg', 'photo.jpg'],
        ['registration-evidence', 'application/pdf', 'evidence.pdf'],
        ['ticket-image', 'image/png', 'photo.png'],
        ['ticket-document', 'application/zip', 'archive.zip'],
        ['ticket-audio', 'audio/mpeg', 'audio.mp3'],
        ['ticket-video', 'video/mp4', 'video.mp4'],
        ['service-invoice', 'application/pdf', 'invoice.pdf'],
        ['signed-document', 'application/pdf', 'signed.pdf'],
        ['service-attachment', 'application/pdf', 'attachment.pdf'],
    ];
    it.each(cases)(
        '%s rejects unknown bytes despite allowlisted declarations',
        async (purpose, mime, name) => {
            await expect(
                Promise.resolve().then(() =>
                    assertFilePolicy(
                        purpose,
                        Buffer.from([0, 1, 2, 3, 4, 5]),
                        mime,
                        false,
                        name,
                    ),
                ),
            ).rejects.toThrow();
        },
    );
    it.each(['active', 'pending'])(
        'rejects before storage and StoredFile creation (%s)',
        async (state) => {
            const write = jest.fn();
            const create = jest.fn();
            const save = jest.fn();
            const files = new FilesService(
                { create, save } as never,
                { write } as never,
                new ConfigService(),
            );
            const input = {
                purpose: 'service-attachment' as const,
                buffer: Buffer.from([0, 1, 2]),
                mimeType: 'application/pdf',
                originalName: 'claim.pdf',
                metadata: {},
            };
            await expect(
                state === 'active'
                    ? files.saveBuffer(input)
                    : files.savePendingBuffer(input),
            ).rejects.toThrow();
            expect(write).not.toHaveBeenCalled();
            expect(create).not.toHaveBeenCalled();
            expect(save).not.toHaveBeenCalled();
        },
    );
});
