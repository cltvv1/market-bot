import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import type { UserPlatform } from './user.entity';

@Entity('user_channels')
@Unique(['platform', 'externalId'])
export class UserChannelEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @Column({ type: 'varchar' })
    platform: UserPlatform;

    @Column()
    externalId: string;

    @Column({ nullable: true })
    username: string;

    @Column({ nullable: true })
    displayName: string;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ type: 'timestamp', nullable: true })
    lastSeenAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
