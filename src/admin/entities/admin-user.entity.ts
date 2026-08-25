import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { AdminUserRoleEntity } from './admin-user-role.entity';

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

    @OneToMany(() => AdminUserRoleEntity, (assignment) => assignment.user)
    roleAssignments: AdminUserRoleEntity[];

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'varchar', nullable: true })
    telegramChatId: string | null;

    @Column({ type: 'varchar', nullable: true })
    maxChatId: string | null;

    @Column({ default: false })
    notifyRegistrations: boolean;

    @Column({ default: false })
    notifyTickets: boolean;

    @Column({ default: false })
    notifyServiceRequests: boolean;

    @Column({ type: 'varchar', nullable: true })
    messengerBindCode: string | null;

    @Column({ type: 'varchar', nullable: true })
    messengerBindPlatform: 'telegram' | 'max' | null;

    @Column({ type: 'timestamp', nullable: true })
    messengerBindCodeExpiresAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    lastLoginAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
