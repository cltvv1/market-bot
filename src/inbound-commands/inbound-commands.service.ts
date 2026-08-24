import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { InboundCommandEntity } from './entities/inbound-command.entity';
import type {
    InboundCommandInput,
    InboundCommandOutcome,
} from './inbound-commands.types';

@Injectable()
export class InboundCommandsService {
    private readonly logger = new Logger(InboundCommandsService.name);

    constructor(
        @InjectRepository(InboundCommandEntity)
        private readonly commands: Repository<InboundCommandEntity>,
        private readonly dataSource: DataSource,
        private readonly usersService: UsersService,
    ) {}

    async execute<T>(
        input: InboundCommandInput,
        handler: () => Promise<T>,
    ): Promise<InboundCommandOutcome<T>> {
        const commandInput = this.normalize(input);
        const queryRunner = this.dataSource.createQueryRunner();
        let advisoryLockAcquired = false;
        let command: InboundCommandEntity | null = null;

        await queryRunner.connect();
        try {
            await queryRunner.query('SELECT pg_advisory_lock(hashtext($1))', [
                this.dialogLockKey(commandInput),
            ]);
            advisoryLockAcquired = true;

            await queryRunner.startTransaction();
            try {
                const commands =
                    queryRunner.manager.getRepository(InboundCommandEntity);
                command = await commands.findOne({
                    where: {
                        platform: commandInput.platform,
                        externalUpdateId: commandInput.externalUpdateId,
                    },
                });

                if (command?.status === 'processed') {
                    await queryRunner.commitTransaction();
                    return { status: 'duplicate', command };
                }
                if (command?.status === 'failed') {
                    await queryRunner.commitTransaction();
                    return { status: 'failed', command };
                }

                const now = new Date();
                if (command) {
                    // The previous worker disappeared before completing this command.
                    command.attemptCount += 1;
                    command.processingStartedAt = now;
                    command.error = null;
                } else {
                    command = commands.create({
                        platform: commandInput.platform,
                        externalUpdateId: commandInput.externalUpdateId,
                        chatId: commandInput.chatId,
                        userId: commandInput.userId ?? null,
                        commandType: commandInput.commandType,
                        payload: commandInput.payload ?? null,
                        status: 'processing',
                        attemptCount: 1,
                        processingStartedAt: now,
                        processedAt: null,
                        error: null,
                        resultMetadata: null,
                    });
                }
                command = await commands.save(command);
                await queryRunner.commitTransaction();
            } catch (error) {
                if (queryRunner.isTransactionActive) {
                    await queryRunner.rollbackTransaction();
                }
                throw error;
            }

            try {
                const result = await handler();
                const userId =
                    commandInput.userId ??
                    (await this.usersService.getUserIdByChannel(
                        commandInput.chatId,
                        commandInput.platform,
                    ));
                const processedAt = new Date();
                command.status = 'processed';
                command.processedAt = processedAt;
                command.userId = userId ?? null;
                command.error = null;
                command.resultMetadata = commandInput.resultMetadata ?? {
                    handled: true,
                };
                await this.commands.save(command);
                return { status: 'processed', command, result };
            } catch (error) {
                const message = this.errorMessage(error);
                await this.commands
                    .update(command.id, {
                        status: 'failed',
                        error: message,
                    })
                    .catch((persistError: unknown) => {
                        this.logger.error(
                            `Failed to persist inbound command ${command!.id} failure`,
                            persistError,
                        );
                    });
                command.status = 'failed';
                command.error = message;
                throw error;
            }
        } finally {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            if (advisoryLockAcquired) {
                await queryRunner
                    .query('SELECT pg_advisory_unlock(hashtext($1))', [
                        this.dialogLockKey(commandInput),
                    ])
                    .catch((error: unknown) => {
                        this.logger.error(
                            'Failed to release inbound dialog lock',
                            error,
                        );
                    });
            }
            await queryRunner.release();
        }
    }

    private normalize(input: InboundCommandInput): InboundCommandInput {
        const externalUpdateId = input.externalUpdateId.trim();
        const chatId = input.chatId.trim();
        const commandType = input.commandType.trim();
        if (!externalUpdateId || !chatId || !commandType) {
            throw new Error(
                'Inbound command requires externalUpdateId, chatId and commandType',
            );
        }
        if (externalUpdateId.length > 255 || commandType.length > 100) {
            throw new Error('Inbound command identity is too long');
        }

        return {
            ...input,
            externalUpdateId,
            chatId,
            commandType,
        };
    }

    private dialogLockKey(input: InboundCommandInput) {
        return `inbound-command:${input.platform}:${input.chatId}`;
    }

    private errorMessage(error: unknown) {
        const message =
            error instanceof Error ? error.message : 'Unknown error';
        return message.slice(0, 1000);
    }
}
