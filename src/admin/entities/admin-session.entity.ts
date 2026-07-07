import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AdminUserEntity } from './admin-user.entity';

@Entity('admin_sessions')
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

    @CreateDateColumn()
    createdAt: Date;
}
