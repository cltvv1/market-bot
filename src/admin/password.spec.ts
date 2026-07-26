import {
    assertStrongPassword,
    createPasswordHash,
    verifyPasswordHash,
} from './password';

describe('admin password hashing', () => {
    it('hashes and verifies without storing plaintext', () => {
        const hash = createPasswordHash('Strong!Password2026');
        expect(hash).not.toContain('Strong!Password2026');
        expect(verifyPasswordHash('Strong!Password2026', hash)).toBe(true);
        expect(verifyPasswordHash('wrong password', hash)).toBe(false);
    });

    it('rejects an obviously weak password', () => {
        expect(() => assertStrongPassword('admin', 'admin')).toThrow();
    });
});
