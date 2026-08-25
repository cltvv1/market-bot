import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { BadRequestException } from '@nestjs/common';

const PASSWORD_ITERATIONS = 310_000;
const derivePasswordKey = promisify(pbkdf2);
const DUMMY_PASSWORD_HASH =
    'pbkdf2$310000$vitma-dummy-password-salt$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function createPasswordHash(
    password: string,
    salt = randomBytes(16).toString('base64url'),
) {
    const hash = Buffer.from(
        await derivePasswordKey(
            password,
            salt,
            PASSWORD_ITERATIONS,
            32,
            'sha256',
        ),
    ).toString('base64url');
    return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPasswordHash(
    password: string,
    storedHash?: string | null,
) {
    const [method, iterationsText, salt, expectedHash] = (
        storedHash || DUMMY_PASSWORD_HASH
    ).split('$');
    const iterations = Number(iterationsText);
    if (
        method !== 'pbkdf2' ||
        !Number.isSafeInteger(iterations) ||
        iterations < 1 ||
        !salt ||
        !expectedHash
    ) {
        return false;
    }

    const actual = Buffer.from(
        await derivePasswordKey(password, salt, iterations, 32, 'sha256'),
    );
    const expected = Buffer.from(expectedHash, 'base64url');
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    );
}

export function assertStrongPassword(password: string, login?: string) {
    const categories = [
        /[a-zа-я]/u,
        /[A-ZА-Я]/u,
        /\d/u,
        /[^A-Za-zА-Яа-я0-9]/u,
    ].filter((pattern) => pattern.test(password)).length;

    if (
        password.length < 12 ||
        password.length > 128 ||
        categories < 3 ||
        (login &&
            password.toLocaleLowerCase().includes(login.toLocaleLowerCase()))
    ) {
        throw new BadRequestException(
            'Password must be 12-128 characters, use at least three character groups, and not contain the login',
        );
    }
}
