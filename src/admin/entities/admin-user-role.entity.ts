import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { AdminUserEntity } from './admin-user.entity';

export const ADMIN_ROLES = [
    'operator',
    'engineer',
    'sales_manager',
    'superadmin',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

@Entity('admin_user_roles')
@Unique('UQ_admin_user_roles_user_role', ['userId', 'role'])
@Index('IDX_admin_user_roles_role', ['role'])
export class AdminUserRoleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @ManyToOne(() => AdminUserEntity, (user) => user.roleAssignments, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'userId',
        foreignKeyConstraintName: 'FK_admin_user_roles_user',
    })
    user: AdminUserEntity;

    @Column({ type: 'varchar' })
    role: AdminRole;

    @CreateDateColumn()
    createdAt: Date;
}
