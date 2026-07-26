import {
    Controller,
    Get,
    ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

const EXPECTED_MIGRATION = 'SecurityFoundation1785079000000';

@Controller('health')
export class HealthController {
    constructor(private readonly dataSource: DataSource) {}

    @Get('live')
    live() {
        return { status: 'ok' };
    }

    @Get('ready')
    async ready() {
        try {
            await this.dataSource.query('SELECT 1');
            const migrations: Array<{ name: string }> =
                await this.dataSource.query(
                    `SELECT "name" FROM "typeorm_migrations" WHERE "name" = $1 LIMIT 1`,
                    [EXPECTED_MIGRATION],
                );
            if (!migrations.length) {
                throw new Error('Expected migration is not applied');
            }
            return {
                status: 'ready',
                database: 'available',
                migrations: 'current',
            };
        } catch {
            throw new ServiceUnavailableException({
                code: 'NOT_READY',
                message: 'Application dependencies are not ready',
                errors: [],
            });
        }
    }
}
