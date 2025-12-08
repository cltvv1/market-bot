import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('tickets')
export class TicketEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userChatId: string;

    @Column({ nullable: true })
    username: string;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    text: string;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ default: false })
    isAnswered: boolean;

    @Column({ type: 'varchar', nullable: true })
    answeredBy: string | null;
}
