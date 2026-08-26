import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { SupportResourceType } from '../support-knowledge.types';
import { ProductSupportResourceEntity } from './product-support-resource.entity';
import { SupportResourceVersionEntity } from './support-resource-version.entity';

@Entity('support_resources')
@Index('UQ_support_resources_slug', ['slug'], { unique: true })
@Index('IDX_support_resources_public_type', ['isPublished', 'type'])
@Check(
    'CK_support_resources_type',
    `"type" IN ('driver','utility','software','firmware','manual','quick_start','datasheet','certificate','sdk','other')`,
)
export class SupportResourceEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 160 })
    slug: string;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    summary: string | null;

    @Column({ type: 'text', nullable: true })
    descriptionMarkdown: string | null;

    @Column({ type: 'varchar', length: 32 })
    type: SupportResourceType;

    @Column({ type: 'varchar', length: 160, nullable: true })
    manufacturerName: string | null;

    @Column({ default: false })
    isOfficial: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    sourceName: string | null;

    @Column({ type: 'varchar', length: 2048, nullable: true })
    sourceUrl: string | null;

    @Column({ type: 'timestamp', nullable: true })
    lastVerifiedAt: Date | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    seoTitle: string | null;

    @Column({ type: 'varchar', length: 320, nullable: true })
    seoDescription: string | null;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ type: 'timestamp', nullable: true })
    publishedAt: Date | null;

    @OneToMany(
        () => SupportResourceVersionEntity,
        (version) => version.resource,
    )
    versions: SupportResourceVersionEntity[];

    @OneToMany(() => ProductSupportResourceEntity, (link) => link.resource)
    productLinks: ProductSupportResourceEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
