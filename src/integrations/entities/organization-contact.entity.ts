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
import type { IntegrationProvider } from '../integration.types';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';

export type OrganizationContactKind = 'phone' | 'email';

@Entity('organization_contacts')
@Index('IDX_organization_contacts_organization', ['organizationId'])
@Index('IDX_organization_contacts_normalized', ['kind', 'normalizedValue'])
@Index('UQ_organization_contacts_external', ['source', 'externalId'], {
    unique: true,
    where: '"externalId" IS NOT NULL',
})
@Check('CK_organization_contacts_kind', `"kind" IN ('phone','email')`)
@Check(
    'CK_organization_contacts_source',
    `"source" IN ('atol_connect','platforma_ofd')`,
)
export class OrganizationContactEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    organizationId: number;

    @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'organizationId',
        foreignKeyConstraintName: 'FK_organization_contacts_organization',
    })
    organization: OrganizationEntity;

    @Column({ type: 'varchar' })
    kind: OrganizationContactKind;

    @Column({ type: 'varchar' })
    rawValue: string;

    @Column({ type: 'varchar', nullable: true })
    normalizedValue: string | null;

    @Column({ type: 'varchar' })
    source: IntegrationProvider;

    @Column({ type: 'varchar', nullable: true })
    externalId: string | null;

    @Column({ type: 'varchar', nullable: true })
    quality: string | null;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'timestamp' })
    lastSeenAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
