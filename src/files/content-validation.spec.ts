import { fixture, pdf, zip } from '../../test/fixtures/files.cjs';
import { detectContent } from './file-content';
import {
    assertFilePolicy,
    channelFilename,
    FILE_POLICIES,
} from './file-policies';
import type { FilePurpose } from './file-storage.types';

const formats: [FilePurpose, string, string, Buffer][] = [
    ['ticket-document', 'application/pdf', 'document.pdf', pdf()],
    ['ticket-document', 'application/zip', 'documents.zip', zip()],
    [
        'ticket-document',
        'text/plain',
        'note.txt',
        Buffer.from('Русский текст\r\n\t<script> is plain text'),
    ],
    ...(['jpeg', 'png', 'webp', 'gif'] as const).map(
        (kind): [FilePurpose, string, string, Buffer] => [
            'ticket-image',
            `image/${kind}`,
            `photo.${kind === 'jpeg' ? 'jpg' : kind}`,
            fixture(`image.${kind === 'jpeg' ? 'jpg' : kind}`),
        ],
    ),
    ['ticket-audio', 'audio/mpeg', 'audio.mp3', fixture('audio.mp3')],
    ['ticket-audio', 'audio/mpeg', 'tagged.mp3', fixture('audio-id3.mp3')],
    ['ticket-audio', 'audio/ogg', 'voice.ogg', fixture('audio.ogg')],
    ['ticket-audio', 'audio/mp4', 'audio.m4a', fixture('audio.m4a')],
    ['ticket-audio', 'audio/webm', 'audio.webm', fixture('audio.webm')],
    ['ticket-video', 'video/mp4', 'video.mp4', fixture('video.mp4')],
    ['ticket-video', 'video/webm', 'video.webm', fixture('video.webm')],
    ['ticket-video', 'video/quicktime', 'video.mov', fixture('video.mov')],
];

describe('independent buffered file content validation', () => {
    it.each(formats)(
        'accepts %s / %s / %s and stores only canonical MIME',
        async (purpose, mime, name, buffer) => {
            for (const declared of [
                mime,
                undefined,
                'application/octet-stream',
            ]) {
                await expect(
                    assertFilePolicy(purpose, buffer, declared, false, name),
                ).resolves.toMatchObject({ mime });
            }
            await expect(
                assertFilePolicy(purpose, buffer, 'image/tiff', false, name),
            ).rejects.toThrow('MIME');
            await expect(
                assertFilePolicy(purpose, buffer, mime, false, 'renamed.exe'),
            ).rejects.toThrow('extension');
            await expect(
                assertFilePolicy(purpose, buffer, mime, false, 'no-extension'),
            ).rejects.toThrow('extension');
        },
    );

    it.each([
        ['image/jpg', 'image/jpeg', 'image.jpg'],
        ['image/pjpeg', 'image/jpeg', 'image.jpg'],
        ['audio/mp3', 'audio/mpeg', 'audio.mp3'],
        ['application/ogg', 'audio/ogg', 'audio.ogg'],
        ['audio/x-m4a', 'audio/mp4', 'audio.m4a'],
    ])(
        'normalizes only the explicit alias %s',
        async (declared, canonical, name) => {
            await expect(
                assertFilePolicy(
                    name.startsWith('audio') ? 'ticket-audio' : 'ticket-image',
                    fixture(name),
                    declared,
                    false,
                    name,
                ),
            ).resolves.toMatchObject({ mime: canonical });
        },
    );

    it('validates UTF-8 text and ZIP using independent rules', async () => {
        await expect(
            assertFilePolicy(
                'ticket-document',
                Buffer.from('PK inventory note\n'),
                'text/plain',
                false,
                'note.txt',
            ),
        ).resolves.toMatchObject({ mime: 'text/plain' });
        await expect(
            assertFilePolicy(
                'ticket-document',
                zip(),
                'application/x-zip-compressed',
                false,
                'archive.zip',
            ),
        ).resolves.toMatchObject({ mime: 'application/zip' });
        await expect(
            assertFilePolicy(
                'ticket-document',
                Buffer.from('\ufeffПривет\t\n'),
                'TEXT/PLAIN; charset="UTF-8"',
                false,
                'note.txt',
            ),
        ).resolves.toMatchObject({ mime: 'text/plain' });
        for (const value of [
            Buffer.alloc(0),
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from([0xc3, 0x28]),
            Buffer.from('hello\0'),
            Buffer.from('hello\x1b'),
            Buffer.from('hello\u0085'),
        ]) {
            await expect(
                assertFilePolicy(
                    'ticket-document',
                    value,
                    'text/plain',
                    false,
                    'note.txt',
                ),
            ).rejects.toThrow();
        }
        await expect(
            assertFilePolicy(
                'ticket-document',
                Buffer.from('Привет'),
                'text/plain; charset=windows-1251',
                false,
                'note.txt',
            ),
        ).rejects.toThrow('parameters');
        await expect(
            assertFilePolicy(
                'ticket-document',
                zip().subarray(0, 30),
                'application/zip',
                false,
                'archive.zip',
            ),
        ).rejects.toThrow();
        const broken = zip();
        broken.writeUInt32LE(0xffffffff, 18);
        // A bad local size is not authoritative; the central directory must also be valid.
        broken.writeUInt32LE(
            0xffffffff,
            broken.indexOf(Buffer.from('PK\x01\x02')) + 20,
        );
        await expect(detectContent(broken)).resolves.toBeNull();
    });

    it.each(formats.filter(([, mime]) => mime !== 'text/plain'))(
        'rejects a short or truncated %s / %s / %s',
        async (_purpose, _mime, _name, buffer) => {
            await expect(
                detectContent(buffer.subarray(0, 4)),
            ).resolves.not.toBe(_mime);
            await expect(
                detectContent(buffer.subarray(0, Math.min(24, buffer.length))),
            ).resolves.not.toBe(_mime);
        },
    );

    it('rejects damaged image/container lengths and PDF cross-reference offsets', async () => {
        const png = fixture('image.png');
        png.writeUInt32BE(0xffffffff, 8);
        const webp = fixture('image.webp');
        webp.writeUInt32LE(0xffffffff, 16);
        const mp4 = fixture('video.mp4');
        mp4.writeUInt32BE(0xffffffff, 0);
        const badPdf = Buffer.from(
            pdf()
                .toString()
                .replace(/startxref\n\d+/, 'startxref\n99999999999999999'),
        );
        const longObjectId = `%PDF-1.7\n${'9'.repeat(2 * 1024 * 1024)} 0 obj\n`;
        const longPdf = Buffer.from(
            `${longObjectId}xref\nstartxref\n${longObjectId.length}\n%%EOF\n`,
        );
        for (const value of [png, webp, mp4, badPdf, longPdf])
            await expect(detectContent(value)).resolves.toBeNull();
    });

    it('never uses a sender MIME to disambiguate media containers', async () => {
        await expect(
            assertFilePolicy(
                'ticket-audio',
                fixture('video.mp4'),
                'audio/mp4',
                false,
                'audio.m4a',
            ),
        ).rejects.toThrow();
        await expect(
            assertFilePolicy(
                'ticket-video',
                fixture('audio.webm'),
                'video/webm',
                false,
                'video.webm',
            ),
        ).rejects.toThrow();
    });

    it('rejects oversized ID3, nested MP4 and EBML metadata lengths', async () => {
        const id3 = fixture('audio-id3.mp3');
        id3.fill(0x7f, 6, 10);
        const mp4 = fixture('video.mp4');
        const header = mp4.indexOf(Buffer.from('mvhd'));
        expect(header).toBeGreaterThan(4);
        mp4.writeUInt32BE(0x7fffffff, header - 4);
        // EBML header containing a numeric field that declares a 2 GiB payload.
        const ebml = Buffer.from('1a45dfa38a42860100000080000000', 'hex');
        for (const value of [id3, mp4, ebml])
            await expect(detectContent(value)).resolves.toBeNull();
    });

    it('requires an HTTP filename and generates channel names only for independently recognized bytes', async () => {
        await expect(
            assertFilePolicy('ticket-document', pdf(), undefined),
        ).rejects.toThrow('filename');
        await expect(channelFilename(pdf())).resolves.toBe('attachment.pdf');
        await expect(channelFilename(fixture('image.png'))).resolves.toBe(
            'attachment.png',
        );
        await expect(channelFilename(pdf(), 'wrong.jpg')).resolves.toBe(
            'wrong.jpg',
        );
        await expect(
            assertFilePolicy(
                'ticket-document',
                pdf(),
                undefined,
                false,
                'wrong.jpg',
            ),
        ).rejects.toThrow('extension');
        await expect(channelFilename(Buffer.from([0, 1, 2]))).rejects.toThrow();
        await expect(
            assertFilePolicy(
                'ticket-document',
                pdf(),
                undefined,
                false,
                'bad\nname.pdf',
            ),
        ).rejects.toThrow('filename');
    });

    it('preserves purpose limits and refuses oversized bytes before content parsing', async () => {
        const max = FILE_POLICIES['service-attachment'].maxBytes;
        await expect(
            assertFilePolicy(
                'service-attachment',
                Buffer.alloc(max, 65),
                'text/plain',
                false,
                'large.txt',
            ),
        ).resolves.toMatchObject({ mime: 'text/plain' });
        await expect(
            assertFilePolicy(
                'service-attachment',
                Buffer.alloc(max + 1),
                'text/plain',
                false,
                'large.txt',
            ),
        ).rejects.toThrow('size limit');
        await expect(
            assertFilePolicy(
                'generated-pdf',
                pdf(),
                'application/pdf',
                false,
                'generated.pdf',
            ),
        ).rejects.toThrow('server-generated');
        await expect(
            assertFilePolicy(
                'support-resource',
                pdf(),
                'application/pdf',
                false,
                'manual.pdf',
            ),
        ).rejects.toThrow('streaming');
    });
});
