import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { UserEntity } from 'src/users/entities/user.entity';

export type InboundCommandStatus = 'processing' | 'processed' | 'failed';

@Entity('inbound_commands')
@Check(
    'CK_inbound_commands_status',
    `"status" IN ('processing', 'processed', 'failed')`,
)
@Index(
    'UQ_inbound_commands_platform_external_update',
    ['platform', 'externalUpdateId'],
    { unique: true },
)
@Index('IDX_inbound_commands_dialog_received', [
    'platform',
    'chatId',
    'receivedAt',
])
@Index('IDX_inbound_commands_status_received', ['status', 'receivedAt'])
export class InboundCommandEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar' })
    platform: UserPlatform;

    @Column({ type: 'varchar', length: 255 })
    externalUpdateId: string;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'integer', nullable: true })
    userId: number | null;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'userId',
        foreignKeyConstraintName: 'FK_inbound_commands_user',
    })
    user: UserEntity | null;

    @Column({ type: 'varchar', length: 100 })
    commandType: string;

    @Column({ type: 'jsonb', nullable: true })
    payload: Record<string, unknown> | null;

    @Column({ type: 'varchar', default: 'processing' })
    status: InboundCommandStatus;

    @Column({ type: 'integer', default: 1 })
    attemptCount: number;

    @CreateDateColumn()
    receivedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    processingStartedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    processedAt: Date | null;

    @Column({ type: 'text', nullable: true })
    error: string | null;

    @Column({ type: 'jsonb', nullable: true })
    resultMetadata: Record<string, unknown> | null;

    @UpdateDateColumn()
    updatedAt: Date;
}
