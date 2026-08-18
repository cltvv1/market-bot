import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type {
    IntegrationProvider,
    IntegrationRunMode,
    IntegrationRunStatus,
} from '../integration.types';

@Entity('integration_runs')
@Index('IDX_integration_runs_provider_created', ['provider', 'createdAt'])
@Check(
    'CK_integration_runs_provider',
    `"provider" IN ('atol_connect','platforma_ofd')`,
)
@Check('CK_integration_runs_mode', `"mode" IN ('shadow','apply')`)
@Check(
    'CK_integration_runs_status',
    `"status" IN ('running','succeeded','partial','failed')`,
)
export class IntegrationRunEntity {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id: string;

    @Column({ type: 'varchar' })
    provider: IntegrationProvider;

    @Column({ type: 'varchar' })
    kind: string;

    @Column({ type: 'varchar', default: 'shadow' })
    mode: IntegrationRunMode;

    @Column({ type: 'varchar', default: 'running' })
    status: IntegrationRunStatus;

    @Column({ type: 'integer', default: 0 })
    receivedCount: number;

    @Column({ type: 'integer', default: 0 })
    appliedCount: number;

    @Column({ type: 'integer', default: 0 })
    skippedCount: number;

    @Column({ type: 'integer', default: 0 })
    errorCount: number;

    @Column({ type: 'jsonb', nullable: true })
    checkpoint: Record<string, unknown> | null;

    @Column({ type: 'text', nullable: true })
    errorSummary: string | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    startedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    finishedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
