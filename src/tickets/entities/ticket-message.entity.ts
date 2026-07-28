import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TicketEntity } from './ticket.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';

export type TicketMessageSender = 'user' | 'operator';
export type TicketMessageSource = 'bot' | 'admin-panel';
export type TicketMessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'video_note' | 'document';

@Entity('ticket_messages')
@Index('IDX_ticket_message_file', ['storedFileId'])
export class TicketMessageEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => TicketEntity, { onDelete: 'CASCADE' })
    ticket: TicketEntity;

    @Column()
    ticketId: number;

    @Column({ type: 'varchar' })
    sender: TicketMessageSender;

    @Column({ type: 'varchar', nullable: true })
    authorId: string | null;

    @Column({ type: 'varchar', default: 'bot' })
    source: TicketMessageSource;

    @Column({ type: 'varchar', default: 'text' })
    messageType: TicketMessageType;

    @Column({ type: 'text', nullable: true })
    text: string | null;

    @Column({ type: 'varchar', nullable: true })
    fileId: string | null;

    @Column({ type: 'varchar', nullable: true })
    fileUniqueId: string | null;

    @Column({ type: 'varchar', nullable: true })
    fileName: string | null;

    @Column({ type: 'varchar', nullable: true })
    mimeType: string | null;

    @Column({ nullable: true })
    fileSize: number;

    @Column({ type: 'text', nullable: true })
    externalUrl: string | null;

    @Column({ type: 'text', nullable: true })
    localPath: string | null;

    @Column({ type: 'integer', nullable: true })
    storedFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'storedFileId', foreignKeyConstraintName: 'FK_ticket_message_file' })
    storedFile: StoredFileEntity | null;

    @CreateDateColumn()
    createdAt: Date;
}
