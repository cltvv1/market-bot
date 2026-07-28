import { sanitizeAuditMetadata } from './audit-sanitizer';

describe('sanitizeAuditMetadata', () => {
    it('redacts secrets and file contents recursively', () => {
        expect(sanitizeAuditMetadata({
            login: 'admin',
            password: 'secret',
            nested: { sessionToken: 'token', value: 2 },
            buffer: Buffer.from('private'),
        })).toEqual({
            login: 'admin',
            password: '[redacted]',
            nested: { sessionToken: '[redacted]', value: 2 },
            buffer: '[redacted]',
        });
    });
});
