import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { IntegrationProvider } from '../integration.types';

@Entity('integration_exclusions')
@Index('IDX_integration_exclusions_match', [
    'inn',
    'provider',
    'observationType',
    'isActive',
])
@Check(
    'CK_integration_exclusions_provider',
    `"provider" IS NULL OR "provider" IN ('atol_connect','platforma_ofd')`,
)
export class IntegrationExclusionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar' })
    inn: string;

    @Column({ type: 'varchar', nullable: true })
    provider: IntegrationProvider | null;

    @Column({ type: 'varchar', nullable: true })
    observationType: string | null;

    @Column({ type: 'text', nullable: true })
    reason: string | null;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
