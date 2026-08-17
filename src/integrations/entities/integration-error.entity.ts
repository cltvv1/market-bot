import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { IntegrationProvider } from '../integration.types';
import { IntegrationRunEntity } from './integration-run.entity';

@Entity('integration_errors')
@Index('IDX_integration_errors_run', ['integrationRunId', 'createdAt'])
@Check(
    'CK_integration_errors_provider',
    `"provider" IN ('atol_connect','platforma_ofd')`,
)
export class IntegrationErrorEntity {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id: string;

    @Column({ type: 'bigint' })
    integrationRunId: string;

    @ManyToOne(() => IntegrationRunEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'integrationRunId',
        foreignKeyConstraintName: 'FK_integration_error_run',
    })
    integrationRun: IntegrationRunEntity;

    @Column({ type: 'varchar' })
    provider: IntegrationProvider;

    @Column({ type: 'varchar', nullable: true })
    entityType: string | null;

    @Column({ type: 'varchar', nullable: true })
    externalId: string | null;

    @Column({ type: 'varchar' })
    code: string;

    @Column({ type: 'text' })
    message: string;

    @CreateDateColumn()
    createdAt: Date;
}
