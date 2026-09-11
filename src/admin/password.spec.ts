import { BadRequestException } from '@nestjs/common';
import { createTestPassword } from '../../test/test-password';
import * as passwordPolicy from './password';
import {
    assertStrongPassword,
    createPasswordHash,
    verifyPasswordHash,
} from './password';

describe('admin password hashing', () => {
    it('hashes and verifies without storing plaintext', async () => {
        const hash = await createPasswordHash('Strong!Password2026');
        expect(hash).not.toContain('Strong!Password2026');
        await expect(
            verifyPasswordHash('Strong!Password2026', hash),
        ).resolves.toBe(true);
        await expect(verifyPasswordHash('wrong password', hash)).resolves.toBe(
            false,
        );
    });

    it('keeps the existing PBKDF2 format compatible', async () => {
        const legacy = await createPasswordHash(
            'Strong!Password2026',
            'legacy-fixed-salt',
        );
        expect(legacy).toMatch(/^pbkdf2\$310000\$legacy-fixed-salt\$/);
        await expect(
            verifyPasswordHash('Strong!Password2026', legacy),
        ).resolves.toBe(true);
    });

    it('runs PBKDF2 off the event loop for unknown users', async () => {
        let eventLoopAdvanced = false;
        const verification = verifyPasswordHash('unknown-password', null);
        await new Promise<void>((resolve) =>
            setImmediate(() => {
                eventLoopAdvanced = true;
                resolve();
            }),
        );
        expect(eventLoopAdvanced).toBe(true);
        await expect(verification).resolves.toBe(false);
    });

    it('rejects an obviously weak password', () => {
        expect(() => assertStrongPassword('admin', 'admin')).toThrow();
    });

    it('regenerates rejected runtime test credentials using the actual policy', () => {
        const policy = jest.spyOn(passwordPolicy, 'assertStrongPassword');
        policy.mockImplementationOnce(() => {
            throw new BadRequestException('Synthetic candidate rejected');
        });
        try {
            const generated = createTestPassword(['synthetic-login']);
            expect(policy.mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(() =>
                assertStrongPassword(generated, 'synthetic-login'),
            ).not.toThrow();
        } finally {
            policy.mockRestore();
        }
    });

    it('bounds rejected test-password generation attempts', () => {
        const policy = jest
            .spyOn(passwordPolicy, 'assertStrongPassword')
            .mockImplementation(() => {
                throw new BadRequestException('Synthetic candidate rejected');
            });
        try {
            expect(() => createTestPassword()).toThrow('Could not generate');
            expect(policy).toHaveBeenCalledTimes(100);
        } finally {
            policy.mockRestore();
        }
    });
});
