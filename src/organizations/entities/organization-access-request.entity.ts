import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrganizationEntity } from './organization.entity';

export type OrganizationAccessRequestStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'cancelled';
export type OrganizationAccessRequestedRole = 'representative';

@Entity('organization_access_requests')
@Index('IDX_org_access_request_user_created', ['userId', 'createdAt'])
@Index('IDX_org_access_request_status_created', ['status', 'createdAt'])
@Index('UQ_org_access_request_pending', ['organizationId', 'userId'], {
    unique: true,
    where: `"status" = 'pending'`,
})
@Check(
    'CK_org_access_request_status',
    `"status" IN ('pending','approved','rejected','cancelled')`,
)
@Check('CK_org_access_request_role', `"requestedRole" = 'representative'`)
export class OrganizationAccessRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    organizationId: number;

    @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'organizationId',
        foreignKeyConstraintName: 'FK_org_access_request_organization',
    })
    organization: OrganizationEntity;

    @Column()
    userId: number;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'userId',
        foreignKeyConstraintName: 'FK_org_access_request_user',
    })
    user: UserEntity;

    @Column({ type: 'varchar', default: 'pending' })
    status: OrganizationAccessRequestStatus;

    @Column({ type: 'varchar', default: 'representative' })
    requestedRole: OrganizationAccessRequestedRole;

    @Column({ type: 'varchar', nullable: true })
    submittedName: string | null;

    @Column({ type: 'varchar', nullable: true })
    submittedPhone: string | null;

    @Column({ type: 'varchar', nullable: true })
    submittedEmail: string | null;

    @Column({ type: 'varchar', nullable: true })
    comment: string | null;

    @Column({ type: 'integer', nullable: true })
    reviewedByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'reviewedByStaffId',
        foreignKeyConstraintName: 'FK_org_access_request_reviewer',
    })
    reviewedByStaff: AdminUserEntity | null;

    @Column({ type: 'varchar', nullable: true })
    reviewComment: string | null;

    @Column({ type: 'timestamp', nullable: true })
    reviewedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    cancelledAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
