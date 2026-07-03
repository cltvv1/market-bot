import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TicketEntity } from './ticket.entity';

export type TicketMessageSender = 'user' | 'operator';
export type TicketMessageSource = 'bot' | 'admin-panel';

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

    @Column({ type: 'text' })
    text: string;

    @CreateDateColumn()
    createdAt: Date;
}
