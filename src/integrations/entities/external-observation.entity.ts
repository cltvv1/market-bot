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
import type {
    IntegrationProvider,
    ObservationSeverity,
    ObservationStatus,
} from '../integration.types';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { IntegrationRunEntity } from './integration-run.entity';

@Entity('external_observations')
@Unique('UQ_external_observation_provider_key', ['provider', 'externalKey'])
@Index('IDX_external_observations_subject', [
    'organizationId',
    'cashRegisterId',
])
@Index('IDX_external_observations_status_seen', ['status', 'lastSeenAt'])
@Check(
    'CK_external_observations_provider',
    `"provider" IN ('atol_connect','platforma_ofd')`,
)
@Check(
    'CK_external_observations_severity',
    `"severity" IN ('info','low','normal','high','urgent')`,
)
@Check('CK_external_observations_status', `"status" IN ('active','resolved')`)
export class ExternalObservationEntity {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id: string;

    @Column({ type: 'varchar' })
    provider: IntegrationProvider;

    @Column({ type: 'varchar' })
    externalKey: string;

    @Column({ type: 'bigint', nullable: true })
    integrationRunId: string | null;

    @ManyToOne(() => IntegrationRunEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'integrationRunId',
        foreignKeyConstraintName: 'FK_external_observation_run',
    })
    integrationRun: IntegrationRunEntity | null;

    @Column({ type: 'integer', nullable: true })
    organizationId: number | null;

    @ManyToOne(() => OrganizationEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'organizationId',
        foreignKeyConstraintName: 'FK_external_observation_organization',
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
        foreignKeyConstraintName: 'FK_external_observation_cash_register',
    })
    cashRegister: CashRegisterEntity | null;

    @Column({ type: 'varchar' })
    kind: string;

    @Column({ type: 'varchar', default: 'normal' })
    severity: ObservationSeverity;

    @Column({ type: 'varchar' })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'varchar', default: 'active' })
    status: ObservationStatus;

    @Column({ type: 'varchar' })
    fingerprint: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;

    @Column({ type: 'timestamp' })
    occurredAt: Date;

    @Column({ type: 'timestamp' })
    lastSeenAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
