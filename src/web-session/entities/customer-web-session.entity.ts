import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

@Entity('customer_web_sessions')
@Index('IDX_customer_web_sessions_user', ['userId'])
@Index('IDX_customer_web_sessions_expiry_active', ['expiresAt', 'revokedAt'])
export class CustomerWebSessionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    tokenHash: string;

    @Column()
    userId: number;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'userId',
        foreignKeyConstraintName: 'FK_customer_web_sessions_user',
    })
    user: UserEntity;

    @Column({ type: 'timestamp' })
    expiresAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastUsedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
