import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import type { OpportunityStatus } from '../integration.types';
import type { ServiceRequestPriority } from 'src/service-requests/entities/service-request.entity';
import { ServiceRequestEntity } from 'src/service-requests/entities/service-request.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';

@Entity('service_opportunities')
@Unique('UQ_service_opportunity_identity', ['identityKey'])
@Index('IDX_service_opportunities_status_seen', ['status', 'lastSeenAt'])
@Check(
    'CK_service_opportunities_priority',
    `"priority" IN ('low','normal','high','urgent')`,
)
@Check(
    'CK_service_opportunities_status',
    `"status" IN ('new','in_progress','contact_later','converted','resolved','not_relevant')`,
)
export class ServiceOpportunityEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar' })
    identityKey: string;

    @Column({ type: 'integer', nullable: true })
    organizationId: number | null;

    @ManyToOne(() => OrganizationEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'organizationId',
        foreignKeyConstraintName: 'FK_service_opportunity_organization',
    })
    organization: OrganizationEntity | null;

    @Column({ type: 'integer', nullable: true })
    cashRegisterId: number | null;

    @ManyToOne(() => CashRegisterEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'cashRegisterId',
        foreignKeyConstraintName: 'FK_service_opportunity_cash_register',
    })
    cashRegister: CashRegisterEntity | null;

    @Column({ type: 'varchar' })
    type: string;

    @Column({ type: 'varchar' })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'varchar', default: 'normal' })
    priority: ServiceRequestPriority;

    @Column({ type: 'varchar', default: 'new' })
    status: OpportunityStatus;

    @Column({ type: 'integer', nullable: true })
    assignedAdminId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'assignedAdminId',
        foreignKeyConstraintName: 'FK_service_opportunity_admin',
    })
    assignedAdmin: AdminUserEntity | null;

    @Column({ type: 'integer', nullable: true })
    serviceRequestId: number | null;

    @ManyToOne(() => ServiceRequestEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'serviceRequestId',
        foreignKeyConstraintName: 'FK_service_opportunity_request',
    })
    serviceRequest: ServiceRequestEntity | null;

    @Column({ type: 'timestamp' })
    firstSeenAt: Date;

    @Column({ type: 'timestamp' })
    lastSeenAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    callbackAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    resolvedAt: Date | null;

    @Column({ type: 'text', nullable: true })
    operatorComment: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
