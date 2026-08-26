import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';

@Entity('product_support_profiles')
export class ProductSupportProfileEntity {
    @PrimaryColumn({ type: 'integer' })
    productId: number;

    @OneToOne(() => CatalogProductEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_product_support_profiles_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'text', nullable: true })
    introMarkdown: string | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    seoTitle: string | null;

    @Column({ type: 'varchar', length: 320, nullable: true })
    seoDescription: string | null;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ type: 'timestamp', nullable: true })
    publishedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
