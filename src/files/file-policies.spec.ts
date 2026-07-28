import { assertFilePolicy, detectMime } from './file-policies';

describe('file policies', () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    it('detects common signatures', () => {
        expect(detectMime(pdf)).toBe('application/pdf');
        expect(detectMime(jpeg)).toBe('image/jpeg');
    });

    it('accepts an allowed registration photo', () => {
        expect(assertFilePolicy('registration-photo', jpeg, 'image/jpeg').mime).toBe('image/jpeg');
    });

    it('rejects a mismatched signature', () => {
        expect(() => assertFilePolicy('service-invoice', jpeg, 'application/pdf')).toThrow();
    });

    it('rejects a client supplied server-generated file', () => {
        expect(() => assertFilePolicy('generated-pdf', pdf, 'application/pdf')).toThrow();
    });

    it('accepts a server-generated PDF', () => {
        expect(assertFilePolicy('generated-pdf', pdf, 'application/pdf', true).mime).toBe('application/pdf');
    });
});
