import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';

@Entity('tickets')
@Index('UQ_tickets_active_client', ['platform', 'userChatId'], {
    unique: true,
    where: `"isAnswered" = false`,
})
export class TicketEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userChatId: string;

    @Column({ type: 'varchar', default: 'telegram' })
    platform: UserPlatform;

    @Column({ nullable: true })
    userId: number;

    @Column({ nullable: true })
    organizationId: number;

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
