import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { SupportResourceEntity } from './support-resource.entity';

@Entity('product_support_resources')
@Unique('UQ_product_support_resources_pair', ['productId', 'resourceId'])
@Index('IDX_product_support_resources_product', ['productId'])
@Index('IDX_product_support_resources_resource', ['resourceId'])
export class ProductSupportResourceEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    productId: number;

    @ManyToOne(() => CatalogProductEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_product_support_resources_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'integer' })
    resourceId: number;

    @ManyToOne(
        () => SupportResourceEntity,
        (resource) => resource.productLinks,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({
        name: 'resourceId',
        foreignKeyConstraintName: 'FK_product_support_resources_resource',
    })
    resource: SupportResourceEntity;

    @Column({ type: 'varchar', length: 500, nullable: true })
    compatibilityNote: string | null;

    @Column({ type: 'integer', default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;
}
