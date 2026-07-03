import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type UserPlatform = 'telegram' | 'max';

@Entity('users')
@Unique(['platform', 'chatId'])
export class UserEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    chatId: string;

    @Column({ type: 'varchar', default: 'telegram' })
    platform: UserPlatform;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    username: string;

    @Column({ type: 'timestamp', nullable: true })
    firstSeenAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastSeenAt: Date;

    @Column({ default: true })
    sendNews: boolean;

    @Column({ default: true })
    sendImportant: boolean;

    @Column({ default: false })
    isAdmin: boolean;

    @Column({ default: false })
    isOperator: boolean;
    
    @Column({ type: 'varchar', nullable: true })
    talkingTo: string | null;
}
