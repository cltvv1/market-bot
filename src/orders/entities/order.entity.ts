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
    VersionColumn,
} from 'typeorm';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import type {
    OrderCustomerType,
    OrderDeliveryType,
    OrderStatus,
} from '../order.types';
import { OrderEventEntity } from './order-event.entity';
import { OrderLineEntity } from './order-line.entity';

@Entity('orders')
@Index('UQ_orders_user_idempotency', ['createdByUserId', 'idempotencyKey'], {
    unique: true,
})
@Index('IDX_orders_user_created', ['createdByUserId', 'createdAt'])
@Index('IDX_orders_status_created', ['status', 'createdAt'])
@Index('IDX_orders_organization', ['organizationId'])
@Index('IDX_orders_organization_inn', ['organizationInnSnapshot'])
@Index('IDX_orders_created', ['createdAt', 'id'])
@Check(
    'CK_orders_status',
    `"status" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled')`,
)
@Check(
    'CK_orders_customer_type',
    `"customerType" IN ('organization','individual')`,
)
@Check(
    'CK_orders_delivery_type',
    `"deliveryType" IN ('pickup','courier','transport_company')`,
)
@Check('CK_orders_currency', `"currency" = 'RUB'`)
@Check('CK_orders_subtotal_nonnegative', `"catalogPricedSubtotalMinor" >= 0`)
@Check('CK_orders_version_positive', `"version" > 0`)
@Check('CK_orders_fingerprint', `"submissionFingerprint" ~ '^[0-9a-f]{64}$'`)
@Check(
    'CK_orders_contact_required',
    `btrim("contactNameSnapshot") <> '' AND btrim("contactPhoneSnapshot") <> ''`,
)
@Check(
    'CK_orders_customer_shape',
    `("customerType" = 'individual' AND "organizationId" IS NULL AND "organizationNameSnapshot" IS NULL AND "organizationInnSnapshot" IS NULL AND "organizationKppSnapshot" IS NULL AND "organizationOgrnSnapshot" IS NULL AND "organizationLegalAddressSnapshot" IS NULL AND "organizationActualAddressSnapshot" IS NULL AND "organizationTaxSystemSnapshot" IS NULL) OR ("customerType" = 'organization' AND "organizationNameSnapshot" IS NOT NULL AND btrim("organizationNameSnapshot") <> '' AND "organizationInnSnapshot" IS NOT NULL)`,
)
@Check(
    'CK_orders_organization_identifiers',
    `("organizationInnSnapshot" IS NULL OR "organizationInnSnapshot" ~ '^([0-9]{10}|[0-9]{12})$') AND ("organizationKppSnapshot" IS NULL OR "organizationKppSnapshot" ~ '^[0-9]{9}$') AND ("organizationOgrnSnapshot" IS NULL OR "organizationOgrnSnapshot" ~ '^([0-9]{13}|[0-9]{15})$')`,
)
@Check(
    'CK_orders_delivery_shape',
    `("deliveryType" = 'pickup') OR ("deliveryType" = 'courier' AND "deliveryCitySnapshot" IS NOT NULL AND btrim("deliveryCitySnapshot") <> '' AND "deliveryAddressSnapshot" IS NOT NULL AND btrim("deliveryAddressSnapshot") <> '') OR ("deliveryType" = 'transport_company' AND "deliveryCitySnapshot" IS NOT NULL AND btrim("deliveryCitySnapshot") <> '')`,
)
export class OrderEntity {
    @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_orders' })
    id: number;

    @Column({ type: 'integer' })
    createdByUserId: number;

    @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'createdByUserId',
        foreignKeyConstraintName: 'FK_orders_created_by_user',
    })
    createdByUser: UserEntity;

    @Column({ type: 'uuid' })
    idempotencyKey: string;

    @Column({ type: 'char', length: 64 })
    submissionFingerprint: string;

    @Column({ type: 'varchar', length: 32, default: 'submitted' })
    status: OrderStatus;

    @VersionColumn()
    version: number;

    @Column({ type: 'varchar', length: 32 })
    customerType: OrderCustomerType;

    @Column({ type: 'integer', nullable: true })
    organizationId: number | null;

    @ManyToOne(() => OrganizationEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'organizationId',
        foreignKeyConstraintName: 'FK_orders_organization',
    })
    organization: OrganizationEntity | null;

    @Column({ type: 'varchar', length: 300, nullable: true })
    organizationNameSnapshot: string | null;

    @Column({ type: 'varchar', length: 12, nullable: true })
    organizationInnSnapshot: string | null;

    @Column({ type: 'varchar', length: 9, nullable: true })
    organizationKppSnapshot: string | null;

    @Column({ type: 'varchar', length: 15, nullable: true })
    organizationOgrnSnapshot: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    organizationLegalAddressSnapshot: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    organizationActualAddressSnapshot: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    organizationTaxSystemSnapshot: string | null;

    @Column({ type: 'varchar', length: 160 })
    contactNameSnapshot: string;

    @Column({ type: 'varchar', length: 30 })
    contactPhoneSnapshot: string;

    @Column({ type: 'varchar', length: 254, nullable: true })
    contactEmailSnapshot: string | null;

    @Column({ type: 'varchar', length: 32 })
    deliveryType: OrderDeliveryType;

    @Column({ type: 'varchar', length: 160, nullable: true })
    deliveryCitySnapshot: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    deliveryAddressSnapshot: string | null;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    deliveryCommentSnapshot: string | null;

    @Column({ type: 'varchar', length: 2000, nullable: true })
    customerComment: string | null;

    @Column({ type: 'numeric', precision: 20, scale: 0 })
    catalogPricedSubtotalMinor: string;

    @Column({ default: false })
    hasUnpricedItems: boolean;

    @Column({ type: 'char', length: 3, default: 'RUB' })
    currency: 'RUB';

    @OneToMany(() => OrderLineEntity, (line) => line.order)
    lines: OrderLineEntity[];

    @OneToMany(() => OrderEventEntity, (event) => event.order)
    events: OrderEventEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
