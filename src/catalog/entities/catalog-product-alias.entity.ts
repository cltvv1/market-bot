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
import { CatalogProductEntity } from './catalog-product.entity';

@Entity('catalog_product_aliases')
@Unique('UQ_catalog_product_aliases_product_normalized', [
    'productId',
    'normalizedAlias',
])
@Index('IDX_catalog_product_aliases_normalized', ['normalizedAlias'])
@Index('IDX_catalog_product_aliases_product', ['productId'])
export class CatalogProductAliasEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    productId: number;

    @ManyToOne(() => CatalogProductEntity, (product) => product.aliases, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_catalog_product_aliases_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'varchar', length: 160 })
    alias: string;

    @Column({ type: 'varchar', length: 160 })
    normalizedAlias: string;

    @CreateDateColumn()
    createdAt: Date;
}
