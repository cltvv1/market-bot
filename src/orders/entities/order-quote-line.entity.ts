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
import type { CatalogVatRate } from 'src/catalog/catalog.types';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { OrderLineEntity } from './order-line.entity';
import { OrderQuoteEntity } from './order-quote.entity';

@Entity('order_quote_lines')
@Index('UQ_order_quote_lines_quote_product', ['quoteId', 'productId'], {
    unique: true,
})
@Index('UQ_order_quote_lines_quote_position', ['quoteId', 'position'], {
    unique: true,
})
@Index('UQ_order_quote_lines_quote_source', ['quoteId', 'sourceOrderLineId'], {
    unique: true,
})
@Index('IDX_order_quote_lines_quote', ['quoteId'])
@Index('IDX_order_quote_lines_product', ['productId'])
@Check('CK_order_quote_lines_quantity', `"quantity" > 0`)
@Check('CK_order_quote_lines_position', `"position" >= 0`)
@Check(
    'CK_order_quote_lines_vat_rate',
    `"vatRateSnapshot" IN (0,500,700,1000,2000)`,
)
@Check(
    'CK_order_quote_lines_catalog_money_shape',
    `("catalogUnitPriceMinor" IS NULL AND "catalogLineTotalMinor" IS NULL) OR ("catalogUnitPriceMinor" IS NOT NULL AND "catalogLineTotalMinor" IS NOT NULL AND "catalogUnitPriceMinor" >= 0 AND "catalogLineTotalMinor" >= 0 AND "catalogLineTotalMinor" = "catalogUnitPriceMinor" * "quantity")`,
)
@Check(
    'CK_order_quote_lines_quoted_money_shape',
    `("quotedUnitPriceMinor" IS NULL AND "quotedLineTotalMinor" IS NULL) OR ("quotedUnitPriceMinor" IS NOT NULL AND "quotedLineTotalMinor" IS NOT NULL AND "quotedUnitPriceMinor" >= 0 AND "quotedLineTotalMinor" >= 0 AND "quotedLineTotalMinor" = "quotedUnitPriceMinor" * "quantity")`,
)
export class OrderQuoteLineEntity {
    @PrimaryGeneratedColumn({
        primaryKeyConstraintName: 'PK_order_quote_lines',
    })
    id: number;

    @Column({ type: 'integer' })
    quoteId: number;

    @ManyToOne(() => OrderQuoteEntity, (quote) => quote.lines, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'quoteId',
        foreignKeyConstraintName: 'FK_order_quote_lines_quote',
    })
    quote: OrderQuoteEntity;

    @Column({ type: 'integer' })
    productId: number;

    @ManyToOne(() => CatalogProductEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_order_quote_lines_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'integer', nullable: true })
    sourceOrderLineId: number | null;

    @ManyToOne(() => OrderLineEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'sourceOrderLineId',
        foreignKeyConstraintName: 'FK_order_quote_lines_source_order_line',
    })
    sourceOrderLine: OrderLineEntity | null;

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

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    quotedUnitPriceMinor: string | null;

    @Column({ type: 'smallint' })
    vatRateSnapshot: CatalogVatRate;

    @Column({ type: 'integer' })
    quantity: number;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    catalogLineTotalMinor: string | null;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    quotedLineTotalMinor: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
