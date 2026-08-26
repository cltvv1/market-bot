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
import { CatalogProductEntity } from './catalog-product.entity';

@Entity('catalog_categories')
@Index('UQ_catalog_categories_slug', ['slug'], { unique: true })
@Index('IDX_catalog_categories_parent', ['parentId'])
@Index('IDX_catalog_categories_public_order', ['isPublished', 'sortOrder'])
@Check(
    'CK_catalog_categories_not_self_parent',
    '"parentId" IS NULL OR "parentId" <> "id"',
)
export class CatalogCategoryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer', nullable: true })
    parentId: number | null;

    @ManyToOne(() => CatalogCategoryEntity, (category) => category.children, {
        nullable: true,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'parentId',
        foreignKeyConstraintName: 'FK_catalog_categories_parent',
    })
    parent: CatalogCategoryEntity | null;

    @OneToMany(() => CatalogCategoryEntity, (category) => category.parent)
    children: CatalogCategoryEntity[];

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 160 })
    slug: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'integer', default: 0 })
    sortOrder: number;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    oneCRef: string | null;

    @OneToMany(() => CatalogProductEntity, (product) => product.category)
    products: CatalogProductEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
