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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
