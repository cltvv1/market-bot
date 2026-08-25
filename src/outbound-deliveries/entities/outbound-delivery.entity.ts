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
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type OutboundDeliveryPlatform = Exclude<UserPlatform, 'web'>;
export type OutboundDeliveryKind = 'text' | 'document' | 'image';
export type OutboundDeliveryAudience = 'customer' | 'staff';
export type OutboundDeliveryStatus =
    | 'pending'
    | 'processing'
    | 'retrying'
    | 'sent'
    | 'failed';

export interface OutboundDeliveryPayload {
    text?: string;
    caption?: string;
    filename?: string;
    parseMode?: 'HTML' | 'Markdown';
    inlineKeyboard?: {
        buttons: Array<{ text: string; callbackData: string }>;
        columns?: number;
    };
}

@Entity('outbound_deliveries')
@Index('UQ_outbound_deliveries_dedupe_key', ['dedupeKey'], { unique: true })
@Index('IDX_outbound_deliveries_eligible', ['status', 'nextAttemptAt'])
@Index('IDX_outbound_deliveries_source', ['sourceType', 'sourceId'])
@Check(
    'CK_outbound_deliveries_status',
    `"status" IN ('pending','processing','retrying','sent','failed')`,
)
@Check('CK_outbound_deliveries_platform', `"platform" IN ('telegram','max')`)
@Check('CK_outbound_deliveries_kind', `"kind" IN ('text','document','image')`)
@Check('CK_outbound_deliveries_audience', `"audience" IN ('customer','staff')`)
@Check(
    'CK_outbound_deliveries_file_kind',
    `("kind" = 'text' AND "storedFileId" IS NULL) OR ("kind" IN ('document','image') AND "storedFileId" IS NOT NULL)`,
)
@Check('CK_outbound_deliveries_attempt_count', `"attemptCount" >= 0`)
export class OutboundDeliveryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255 })
    dedupeKey: string;

    @Column({ type: 'varchar' })
    platform: OutboundDeliveryPlatform;

    @Column({ type: 'text' })
    recipientChatId: string;

    @Column({ type: 'varchar', length: 20 })
    kind: OutboundDeliveryKind;

    @Column({ type: 'varchar', length: 20 })
    audience: OutboundDeliveryAudience;

    @Column({ type: 'varchar', length: 100 })
    sourceType: string;

    @Column({ type: 'varchar', length: 100 })
    sourceId: string;

    @Column({ type: 'jsonb' })
    payload: OutboundDeliveryPayload;

    @Column({ type: 'integer', nullable: true })
    storedFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_outbound_deliveries_stored_file',
    })
    storedFile: StoredFileEntity | null;

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status: OutboundDeliveryStatus;

    @Column({ type: 'integer', default: 0 })
    attemptCount: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    nextAttemptAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastAttemptAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    claimedAt: Date | null;

    @Column({ type: 'uuid', nullable: true })
    claimToken: string | null;

    @Column({ type: 'timestamp', nullable: true })
    sentAt: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    providerMessageId: string | null;

    @Column({ type: 'text', nullable: true })
    lastError: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
