import { BadRequestException } from '@nestjs/common';
import {
    decodeSupportFilename,
    detectSupportFileKind,
    validateSupportFile,
} from './support-file-policy';

describe('support file policy', () => {
    it.each([
        ['pdf', Buffer.from('%PDF-1.7')],
        ['zip', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
        ['msi', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
        ['seven_zip', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
        ['rar', Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])],
        ['cab', Buffer.from('MSCF')],
        ['gzip', Buffer.from([0x1f, 0x8b])],
        ['pe', portableExecutable()],
    ])('detects %s by content signature', (kind, buffer) => {
        expect(detectSupportFileKind(buffer)).toBe(kind);
    });

    it('accepts encoded UTF-8 filenames and normalizes MIME aliases', () => {
        const filename = decodeSupportFilename(
            encodeURIComponent('Драйвер ККТ.zip'),
        );
        expect(
            validateSupportFile(
                Buffer.from([0x50, 0x4b, 0x03, 0x04]),
                filename,
                'application/x-zip-compressed; charset=binary',
                'driver',
            ),
        ).toEqual({
            originalName: 'Драйвер ККТ.zip',
            kind: 'zip',
            mimeType: 'application/zip',
        });
    });

    it.each([
        '../driver.zip',
        '..%2Fdriver.zip',
        'folder%5Cdriver.zip',
        '%E0%A4%A',
        '',
    ])('rejects an unsafe encoded filename %s', (filename) => {
        expect(() => decodeSupportFilename(filename)).toThrow(
            BadRequestException,
        );
    });

    it('rejects extension, MIME, and resource-type mismatches', () => {
        const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
        expect(() =>
            validateSupportFile(zip, 'driver.pdf', 'application/zip', 'driver'),
        ).toThrow(BadRequestException);
        expect(() =>
            validateSupportFile(zip, 'driver.zip', 'application/pdf', 'driver'),
        ).toThrow(BadRequestException);
        expect(() =>
            validateSupportFile(zip, 'manual.zip', 'application/zip', 'manual'),
        ).toThrow(BadRequestException);
    });

    it('does not trust unknown content even with an allowed extension and MIME', () => {
        expect(() =>
            validateSupportFile(
                Buffer.from('plain text'),
                'driver.zip',
                'application/zip',
                'driver',
            ),
        ).toThrow(BadRequestException);
    });
});

function portableExecutable() {
    const buffer = Buffer.alloc(256);
    buffer.write('MZ');
    buffer.writeUInt32LE(128, 0x3c);
    buffer.write('PE\0\0', 128, 'binary');
    return buffer;
}
