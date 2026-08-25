import type { UserPlatform } from 'src/users/entities/user.entity';
import type {
    InboundCommandEntity,
    InboundCommandStatus,
} from './entities/inbound-command.entity';

export interface InboundCommandInput {
    platform: Exclude<UserPlatform, 'web'>;
    externalUpdateId: string;
    chatId: string;
    userId?: number | null;
    commandType: string;
    payload?: Record<string, unknown>;
    resultMetadata?: Record<string, unknown>;
}

export interface ProcessedInboundCommand<T> {
    status: 'processed';
    command: InboundCommandEntity;
    result: T;
}

export interface SkippedInboundCommand {
    status: Extract<InboundCommandStatus, 'failed'> | 'duplicate';
    command: InboundCommandEntity;
}

export type InboundCommandOutcome<T> =
    | ProcessedInboundCommand<T>
    | SkippedInboundCommand;
