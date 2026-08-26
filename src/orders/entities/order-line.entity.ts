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
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import type { CatalogVatRate } from 'src/catalog/catalog.types';
import { OrderEntity } from './order.entity';

@Entity('order_lines')
@Index('UQ_order_lines_order_product', ['orderId', 'productId'], {
    unique: true,
})
@Index('UQ_order_lines_order_position', ['orderId', 'position'], {
    unique: true,
})
@Index('IDX_order_lines_order', ['orderId'])
@Index('IDX_order_lines_product', ['productId'])
@Check('CK_order_lines_quantity', `"quantity" > 0`)
@Check('CK_order_lines_position', `"position" >= 0`)
@Check('CK_order_lines_vat_rate', `"vatRateSnapshot" IN (0,500,700,1000,2000)`)
@Check(
    'CK_order_lines_money_shape',
    `("catalogUnitPriceMinor" IS NULL AND "catalogLineTotalMinor" IS NULL) OR ("catalogUnitPriceMinor" IS NOT NULL AND "catalogLineTotalMinor" IS NOT NULL AND "catalogUnitPriceMinor" >= 0 AND "catalogLineTotalMinor" >= 0 AND "catalogLineTotalMinor" = "catalogUnitPriceMinor" * "quantity")`,
)
export class OrderLineEntity {
    @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_order_lines' })
    id: number;

    @Column({ type: 'integer' })
    orderId: number;

    @ManyToOne(() => OrderEntity, (order) => order.lines, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'orderId',
        foreignKeyConstraintName: 'FK_order_lines_order',
    })
    order: OrderEntity;

    @Column({ type: 'integer' })
    productId: number;

    @ManyToOne(() => CatalogProductEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_order_lines_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'varchar', length: 100 })
    skuSnapshot: string;

    @Column({ type: 'varchar', length: 160 })
    slugSnapshot: string;

    @Column({ type: 'varchar', length: 255 })
    nameSnapshot: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    brandSnapshot: string | null;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    catalogUnitPriceMinor: string | null;

    @Column({ type: 'smallint' })
    vatRateSnapshot: CatalogVatRate;

    @Column({ type: 'integer' })
    quantity: number;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    catalogLineTotalMinor: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
