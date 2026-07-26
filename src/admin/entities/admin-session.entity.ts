import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AdminUserEntity } from './admin-user.entity';

@Entity('admin_sessions')
@Index('IDX_admin_sessions_user', ['userId'])
@Index('IDX_admin_sessions_expiry_active', ['expiresAt', 'revokedAt'])
export class AdminSessionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    tokenHash: string;

    @Column()
    userId: number;

    @ManyToOne(() => AdminUserEntity)
    @JoinColumn({ name: 'userId' })
    user: AdminUserEntity;

    @Column({ type: 'timestamp' })
    expiresAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastUsedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
