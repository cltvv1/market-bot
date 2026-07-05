import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrganizationEntity } from './organization.entity';

export type OrganizationMemberRole = 'owner' | 'manager' | 'accountant' | 'employee';
export type OrganizationMemberStatus = 'pending' | 'active' | 'rejected';

@Entity('organization_members')
@Unique(['organizationId', 'userId'])
export class OrganizationMemberEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    organizationId: number;

    @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: OrganizationEntity;

    @Column()
    userId: number;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @Column({ type: 'varchar', default: 'owner' })
    role: OrganizationMemberRole;

    @Column({ type: 'varchar', default: 'active' })
    status: OrganizationMemberStatus;

    @Column({ type: 'timestamp', nullable: true })
    confirmedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
