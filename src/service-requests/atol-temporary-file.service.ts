import * as fs from 'node:fs';
import * as path from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AtolTemporaryFileService {
    private readonly logger = new Logger(AtolTemporaryFileService.name);
    private readonly root: string;

    constructor(config: ConfigService) {
        this.root = path.resolve(
            process.cwd(),
            config.get<string>('CONSENT_DIR') || 'storage/consents',
        );
    }

    async remove(filePath: string) {
        const resolved = path.resolve(filePath);
        const relative = path.relative(this.root, resolved);
        if (
            !relative ||
            relative.startsWith('..') ||
            path.isAbsolute(relative)
        ) {
            throw new BadRequestException(
                'Temporary consent path is outside the configured root',
            );
        }

        try {
            await fs.promises.rm(resolved, { force: true });
            return true;
        } catch (error) {
            this.logger.warn(
                `Failed to remove temporary ATOL file: ${
                    error instanceof Error ? error.message : 'unknown error'
                }`,
            );
            return false;
        }
    }
}
