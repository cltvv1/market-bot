import {
    fixture as fileFixture,
    pdf as pdfFixture,
} from '../../test/fixtures/files.cjs';
import { BadRequestException } from '@nestjs/common';
import { extractMaxMedia, materializeMaxMedia } from './max-media';

function response(body: Uint8Array, status = 200, contentLength?: number) {
    return new Response(body, {
        status,
        headers:
            contentLength === undefined
                ? {}
                : { 'content-length': String(contentLength) },
    });
}

describe('MAX media normalization', () => {
    it.each([
        [Buffer.from([0, 1, 2]), 'application/pdf'],
        [pdfFixture(), 'image/jpeg'],
    ])(
        'SEC-007 rejects unknown bytes and contradictory provider MIME',
        async (buffer, mimeType) => {
            await expect(
                materializeMaxMedia(
                    {
                        messageType: 'document',
                        fileId: 'synthetic',
                        externalUrl: 'https://media.test/fixture',
                        mimeType,
                    },
                    4096,
                    () => Promise.resolve(response(buffer) as never),
                ),
            ).rejects.toThrow();
        },
    );
    it('SEC-007 creates a missing provider filename from content, not transport MIME', async () => {
        const result = await materializeMaxMedia(
            {
                messageType: 'document',
                fileId: 'synthetic',
                externalUrl: 'https://media.test/fixture',
                mimeType: 'application/octet-stream',
            },
            4096,
            () => Promise.resolve(response(pdfFixture()) as never),
        );
        expect(result).toMatchObject({
            fileName: 'document.pdf',
            mimeType: 'application/pdf',
        });
        await expect(
            materializeMaxMedia(
                {
                    messageType: 'document',
                    fileId: 'synthetic',
                    externalUrl: 'https://media.test/fixture',
                },
                4096,
                () =>
                    Promise.resolve(
                        new Response(pdfFixture(), {
                            headers: { 'content-type': 'image/jpeg' },
                        }) as never,
                    ),
            ),
        ).rejects.toThrow('MIME');
    });
    it('extracts photos and documents with provider IDs', () => {
        expect(
            extractMaxMedia({
                body: {
                    attachments: [
                        {
                            type: 'image',
                            payload: {
                                token: 'photo-id',
                                url: 'https://media.test/photo',
                            },
                        },
                    ],
                },
            }),
        ).toMatchObject({ messageType: 'image', fileId: 'photo-id' });
        expect(
            extractMaxMedia({
                body: {
                    attachments: [
                        {
                            type: 'file',
                            filename: 'form.pdf',
                            size: 10,
                            payload: {
                                token: 'doc-id',
                                url: 'https://media.test/doc',
                            },
                        },
                    ],
                },
            }),
        ).toMatchObject({
            messageType: 'document',
            fileId: 'doc-id',
            fileName: 'form.pdf',
        });
    });

    it('rejects unsupported attachments and incomplete provider references', () => {
        expect(
            extractMaxMedia({
                body: {
                    attachments: [{ type: 'sticker', payload: { code: 'x' } }],
                },
            }),
        ).toBeNull();
        expect(
            extractMaxMedia({
                body: {
                    attachments: [
                        {
                            type: 'image',
                            payload: { url: 'https://media.test/photo' },
                        },
                    ],
                },
            }),
        ).toBeNull();
    });

    it('downloads a supported file and removes its temporary provider URL', async () => {
        const media = await materializeMaxMedia(
            {
                messageType: 'image',
                fileId: 'provider-id',
                externalUrl: 'https://media.test/token-bearing-url',
            },
            4096,
            () => Promise.resolve(response(fileFixture('image.jpg')) as never),
        );

        expect(media.buffer).toEqual(fileFixture('image.jpg'));
        expect(media.mimeType).toBe('image/jpeg');
        expect(media.externalUrl).toBeUndefined();
        expect(JSON.stringify(media)).not.toContain('token-bearing-url');
    });

    it('materializes a MAX document with its filename and detected MIME', async () => {
        const media = await materializeMaxMedia(
            {
                messageType: 'document',
                fileId: 'provider-document',
                fileName: 'consent.pdf',
                externalUrl: 'https://media.test/document',
            },
            4096,
            () => Promise.resolve(response(pdfFixture('%PDF- test')) as never),
        );

        expect(media).toMatchObject({
            messageType: 'document',
            fileName: 'consent.pdf',
            mimeType: 'application/pdf',
            externalUrl: undefined,
        });
    });

    it('accepts a declared text document only when its content is valid text', async () => {
        const media = await materializeMaxMedia(
            {
                messageType: 'document',
                fileId: 'provider-text',
                fileName: 'note.txt',
                externalUrl: 'https://media.test/text',
            },
            100,
            () =>
                Promise.resolve(
                    response(Buffer.from('operator note', 'utf8')) as never,
                ),
        );

        expect(media.mimeType).toBe('text/plain');
    });

    it('rejects missing provider IDs, download errors, and oversized files', async () => {
        await expect(
            materializeMaxMedia(
                {
                    messageType: 'document',
                    externalUrl: 'https://media.test/doc',
                },
                10,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);

        await expect(
            materializeMaxMedia(
                {
                    messageType: 'document',
                    fileId: 'id',
                    externalUrl: 'https://media.test/doc',
                },
                10,
                () => Promise.resolve(response(new Uint8Array(), 503) as never),
            ),
        ).rejects.toThrow('status 503');

        await expect(
            materializeMaxMedia(
                {
                    messageType: 'document',
                    fileId: 'id',
                    externalUrl: 'https://media.test/doc',
                },
                3,
                () =>
                    Promise.resolve(
                        response(Uint8Array.from([1, 2, 3, 4])) as never,
                    ),
            ),
        ).rejects.toThrow('size limit');

        await expect(
            materializeMaxMedia(
                {
                    messageType: 'document',
                    fileId: 'id',
                    externalUrl: 'https://media.test/doc',
                },
                3,
                () =>
                    Promise.resolve(
                        response(Uint8Array.from([1]), 200, 4) as never,
                    ),
            ),
        ).rejects.toThrow('size limit');
    });
});
