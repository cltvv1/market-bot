import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type {
    CatalogAvailabilityStatus,
    CatalogVatRate,
} from '../catalog.types';
import { CatalogCategoryEntity } from './catalog-category.entity';
import { CatalogProductAliasEntity } from './catalog-product-alias.entity';

@Entity('catalog_products')
@Index('UQ_catalog_products_sku', ['sku'], { unique: true })
@Index('UQ_catalog_products_slug', ['slug'], { unique: true })
@Index('IDX_catalog_products_category', ['categoryId'])
@Index('IDX_catalog_products_publication', [
    'categoryId',
    'isPublished',
    'isActive',
])
@Check(
    'CK_catalog_products_price_nonnegative',
    '"displayPriceMinor" IS NULL OR "displayPriceMinor" >= 0',
)
@Check('CK_catalog_products_vat_rate', '"vatRate" IN (0,500,700,1000,2000)')
@Check(
    'CK_catalog_products_availability',
    `"availabilityStatus" IN ('in_stock','low_stock','on_request','unavailable')`,
)
export class CatalogProductEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    categoryId: number;

    @ManyToOne(() => CatalogCategoryEntity, (category) => category.products, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'categoryId',
        foreignKeyConstraintName: 'FK_catalog_products_category',
    })
    category: CatalogCategoryEntity;

    @Column({ type: 'varchar', length: 100 })
    sku: string;

    @Column({ type: 'varchar', length: 160 })
    slug: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    brand: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    shortDescription: string | null;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'integer', nullable: true })
    displayPriceMinor: number | null;

    @Column({ type: 'smallint', default: 2000 })
    vatRate: CatalogVatRate;

    @Column({ type: 'varchar', length: 32, default: 'on_request' })
    availabilityStatus: CatalogAvailabilityStatus;

    @Column({ type: 'jsonb', default: [] })
    features: string[];

    @Column({ type: 'jsonb', default: {} })
    specifications: Record<string, string>;

    @Column({ type: 'jsonb', default: [] })
    packageContents: string[];

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ default: false })
    isPopular: boolean;

    @Column({ default: false })
    isNew: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    oneCRef: string | null;

    @Column({ type: 'timestamp', nullable: true })
    oneCSyncedAt: Date | null;

    @OneToMany(() => CatalogProductAliasEntity, (alias) => alias.product)
    aliases: CatalogProductAliasEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
