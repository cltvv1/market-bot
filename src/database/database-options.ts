import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export interface DatabaseConnectionConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
}

function requireValue(
    environment: NodeJS.ProcessEnv,
    name: string,
    fallbackName?: string,
): string {
    const primaryValue = environment[name]?.trim();
    const fallbackValue = fallbackName
        ? environment[fallbackName]?.trim()
        : undefined;
    const value = primaryValue || fallbackValue;

    if (!value) {
        const fallbackDescription = fallbackName ? ` or ${fallbackName}` : '';
        throw new Error(
            `Missing required database environment variable ${name}${fallbackDescription}`,
        );
    }

    return value;
}

function readPort(value: string, name: string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return port;
}

export function readApplicationDatabaseConfig(
    environment: NodeJS.ProcessEnv = process.env,
): DatabaseConnectionConfig {
    return {
        host: requireValue(environment, 'DB_HOST'),
        port: readPort(requireValue(environment, 'DB_PORT'), 'DB_PORT'),
        database: requireValue(environment, 'DB_NAME'),
        username: requireValue(environment, 'DB_USER'),
        password: requireValue(environment, 'DB_PASS'),
    };
}

export function readTestDatabaseConfig(
    environment: NodeJS.ProcessEnv = process.env,
): DatabaseConnectionConfig {
    const database = requireValue(environment, 'TEST_DB_NAME');
    const applicationDatabase = environment.DB_NAME?.trim();

    if (applicationDatabase && database === applicationDatabase) {
        throw new Error('TEST_DB_NAME must differ from DB_NAME');
    }

    return {
        host: requireValue(environment, 'TEST_DB_HOST', 'DB_HOST'),
        port: readPort(
            requireValue(environment, 'TEST_DB_PORT', 'DB_PORT'),
            'TEST_DB_PORT',
        ),
        database,
        username: requireValue(environment, 'TEST_DB_USER', 'DB_USER'),
        password: requireValue(environment, 'TEST_DB_PASS', 'DB_PASS'),
    };
}

export function createTypeOrmOptions(
    config: DatabaseConnectionConfig,
    databaseDirectory: string,
): DataSourceOptions {
    return {
        type: 'postgres',
        ...config,
        entities: [join(databaseDirectory, '..', '**', '*.entity.{ts,js}')],
        migrations: [join(databaseDirectory, 'migrations', '*.{ts,js}')],
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
        migrationsRun: false,
    };
}
