import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import type {
    ExternalEntityType,
    IntegrationProvider,
} from '../integration.types';

@Entity('external_mappings')
@Unique('UQ_external_mapping_provider_entity_id', [
    'provider',
    'entityType',
    'externalId',
])
@Index('IDX_external_mapping_local', ['entityType', 'localId'])
@Check(
    'CK_external_mappings_provider',
    `"provider" IN ('atol_connect','platforma_ofd')`,
)
export class ExternalMappingEntity {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id: string;

    @Column({ type: 'varchar' })
    provider: IntegrationProvider;

    @Column({ type: 'varchar' })
    entityType: ExternalEntityType;

    @Column({ type: 'varchar' })
    externalId: string;

    @Column({ type: 'integer' })
    localId: number;

    @Column({ type: 'varchar', nullable: true })
    externalRevision: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;

    @Column({ type: 'timestamp' })
    lastSeenAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
