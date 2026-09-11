import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { assertStrongPassword } from '../src/admin/password';

export function createTestPassword(logins: string[] = []) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = randomBytes(32).toString('base64url');
        try {
            assertStrongPassword(candidate);
            for (const login of logins) assertStrongPassword(candidate, login);
            return candidate;
        } catch (error) {
            if (!(error instanceof BadRequestException)) throw error;
        }
    }
    throw new Error('Could not generate a policy-compliant test password');
}
