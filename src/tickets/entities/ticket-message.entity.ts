import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TicketEntity } from './ticket.entity';

export type TicketMessageSender = 'user' | 'operator';
export type TicketMessageSource = 'bot' | 'admin-panel';
export type TicketMessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'video_note' | 'document';

@Entity('ticket_messages')
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

    @CreateDateColumn()
    createdAt: Date;
}
