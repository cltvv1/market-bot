import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import type { OrderQuoteStatus } from '../order.types';
import { OrderEntity } from './order.entity';
import { OrderQuoteLineEntity } from './order-quote-line.entity';

@Entity('order_quotes')
@Unique('UQ_order_quotes_order', ['orderId'])
@Index('IDX_order_quotes_status', ['status'])
@Index('IDX_order_quotes_confirmed_at', ['confirmedAt'])
@Check('CK_order_quotes_status', `"status" IN ('draft','confirmed')`)
@Check('CK_order_quotes_revision_positive', `"revision" > 0`)
@Check('CK_order_quotes_currency', `"currency" = 'RUB'`)
@Check(
    'CK_order_quotes_money_nonnegative',
    `"catalogPricedSubtotalMinor" >= 0 AND "quotedPricedSubtotalMinor" >= 0`,
)
@Check(
    'CK_order_quotes_confirmation_shape',
    `("status" = 'draft' AND "confirmedByStaffId" IS NULL AND "confirmedAt" IS NULL) OR ("status" = 'confirmed' AND "confirmedByStaffId" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "hasUnpricedItems" = false)`,
)
export class OrderQuoteEntity {
    @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_order_quotes' })
    id: number;

    @Column({ type: 'integer' })
    orderId: number;

    @OneToOne(() => OrderEntity, (order) => order.quote, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'orderId',
        foreignKeyConstraintName: 'FK_order_quotes_order',
    })
    order: OrderEntity;

    @Column({ type: 'varchar', length: 16, default: 'draft' })
    status: OrderQuoteStatus;

    @Column({ type: 'integer', default: 1 })
    revision: number;

    @Column({ type: 'numeric', precision: 20, scale: 0 })
    catalogPricedSubtotalMinor: string;

    @Column({ type: 'numeric', precision: 20, scale: 0 })
    quotedPricedSubtotalMinor: string;

    @Column({ default: false })
    hasUnpricedItems: boolean;

    @Column({ type: 'char', length: 3, default: 'RUB' })
    currency: 'RUB';

    @Column({ type: 'varchar', length: 2000, nullable: true })
    internalComment: string | null;

    @Column({ type: 'integer' })
    createdByStaffId: number;

    @ManyToOne(() => AdminUserEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'createdByStaffId',
        foreignKeyConstraintName: 'FK_order_quotes_created_by_staff',
    })
    createdByStaff: AdminUserEntity;

    @Column({ type: 'integer' })
    updatedByStaffId: number;

    @ManyToOne(() => AdminUserEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'updatedByStaffId',
        foreignKeyConstraintName: 'FK_order_quotes_updated_by_staff',
    })
    updatedByStaff: AdminUserEntity;

    @Column({ type: 'integer', nullable: true })
    confirmedByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, {
        nullable: true,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'confirmedByStaffId',
        foreignKeyConstraintName: 'FK_order_quotes_confirmed_by_staff',
    })
    confirmedByStaff: AdminUserEntity | null;

    @Column({ type: 'timestamp', nullable: true })
    confirmedAt: Date | null;

    @OneToMany(() => OrderQuoteLineEntity, (line) => line.quote)
    lines: OrderQuoteLineEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
