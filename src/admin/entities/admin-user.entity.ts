import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AdminRole = 'admin' | 'operator';

@Entity('admin_users')
export class AdminUserEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    login: string;

    @Column()
    displayName: string;

    @Column()
    passwordHash: string;

    @Column({ type: 'varchar', default: 'operator' })
    role: AdminRole;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'varchar', nullable: true })
    telegramChatId: string | null;

    @Column({ type: 'varchar', nullable: true })
    maxChatId: string | null;

    @Column({ default: true })
    notifyRegistrations: boolean;

    @Column({ default: true })
    notifyTickets: boolean;

    @Column({ default: true })
    notifyServiceRequests: boolean;

    @Column({ type: 'varchar', nullable: true })
    messengerBindCode: string | null;

    @Column({ type: 'varchar', nullable: true })
    messengerBindPlatform: 'telegram' | 'max' | null;

    @Column({ type: 'timestamp', nullable: true })
    messengerBindCodeExpiresAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
