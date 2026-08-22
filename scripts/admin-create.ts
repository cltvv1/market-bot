import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import dataSource from '../src/database/data-source';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import {
    assertStrongPassword,
    createPasswordHash,
} from '../src/admin/password';

function readArgument(name: string) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function readHiddenPassword(prompt: string) {
    if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
        throw new Error(
            'Interactive password input requires a TTY. Use ADMIN_CREATE_PASSWORD in a protected local environment.',
        );
    }

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let password = '';

    return new Promise<string>((resolve, reject) => {
        const finish = () => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            stdout.write('\n');
        };
        const onData = (key: string) => {
            if (key === '\u0003') {
                finish();
                reject(new Error('Cancelled'));
                return;
            }
            if (key === '\r' || key === '\n') {
                finish();
                resolve(password);
                return;
            }
            if (key === '\u007f' || key === '\b') {
                if (password.length) {
                    password = password.slice(0, -1);
                    stdout.write('\b \b');
                }
                return;
            }
            password += key;
            stdout.write('*');
        };
        stdin.on('data', onData);
    });
}

async function main() {
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
        const login = (
            readArgument('login') ||
            process.env.ADMIN_CREATE_LOGIN ||
            (await prompt.question('Login: '))
        )
            .trim()
            .toLowerCase();
        const displayName = (
            readArgument('display-name') ||
            process.env.ADMIN_CREATE_DISPLAY_NAME ||
            (await prompt.question('Display name: '))
        ).trim();
        prompt.close();
        const password =
            process.env.ADMIN_CREATE_PASSWORD ||
            (await readHiddenPassword('Password: '));

        if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login)) {
            throw new Error(
                'Login must contain 3-64 lowercase ASCII characters',
            );
        }
        if (displayName.length < 2 || displayName.length > 120) {
            throw new Error('Display name must contain 2-120 characters');
        }
        assertStrongPassword(password, login);

        await dataSource.initialize();
        const existing = await dataSource
            .getRepository(AdminUserEntity)
            .findOne({ where: { login } });
        if (existing) {
            throw new Error(`Staff account "${login}" already exists`);
        }

        await dataSource.transaction(async (manager) => {
            const user = await manager.getRepository(AdminUserEntity).save(
                manager.getRepository(AdminUserEntity).create({
                    login,
                    displayName,
                    passwordHash: createPasswordHash(password),
                    isActive: true,
                }),
            );
            await manager.getRepository(AdminUserRoleEntity).save(
                manager.getRepository(AdminUserRoleEntity).create({
                    userId: user.id,
                    role: 'superadmin',
                }),
            );
        });
        stdout.write(`Superadmin "${login}" created.\n`);
    } finally {
        prompt.close();
        if (dataSource.isInitialized) await dataSource.destroy();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`Failed to create superadmin: ${message}\n`);
    process.exitCode = 1;
});
