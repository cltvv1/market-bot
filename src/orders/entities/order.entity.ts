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
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import type {
    OrderCustomerType,
    OrderDeliveryType,
    OrderFinalDocumentDeliveryMethod,
    OrderFinalDocumentKind,
    OrderFulfillmentMethod,
    OrderPaymentSource,
    OrderStatus,
} from '../order.types';
import { OrderEventEntity } from './order-event.entity';
import { OrderLineEntity } from './order-line.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { OrderQuoteEntity } from './order-quote.entity';
import { OrderDocumentEntity } from './order-document.entity';

@Entity('orders')
@Index('UQ_orders_user_idempotency', ['createdByUserId', 'idempotencyKey'], {
    unique: true,
})
@Index('IDX_orders_user_created', ['createdByUserId', 'createdAt'])
@Index('IDX_orders_status_created', ['status', 'createdAt'])
@Index('IDX_orders_organization', ['organizationId'])
@Index('IDX_orders_organization_inn', ['organizationInnSnapshot'])
@Index('IDX_orders_created', ['createdAt', 'id'])
@Index('IDX_orders_assigned_manager', ['assignedManagerId'])
@Index('IDX_orders_workspace', ['status', 'assignedManagerId', 'createdAt'])
@Index('IDX_orders_invoice_issued_at', ['invoiceIssuedAt'])
@Index('IDX_orders_payment_confirmed_at', ['paymentConfirmedAt'])
@Index('IDX_orders_fulfilled_at', ['fulfilledAt'])
@Index('IDX_orders_completed_at', ['completedAt'])
@Index('IDX_orders_realization_number', ['realizationNumber'])
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
@Check(
    'CK_orders_payment_source',
    `"paymentConfirmationSource" IS NULL OR "paymentConfirmationSource" IN ('bank_statement','payment_order','customer_confirmation','other')`,
)
@Check(
    'CK_orders_payment_confirmation_shape',
    `("paymentReceivedAt" IS NULL AND "paymentConfirmedAt" IS NULL AND "paymentConfirmedByStaffId" IS NULL AND "paymentConfirmationSource" IS NULL AND "paymentConfirmationComment" IS NULL) OR ("paymentReceivedAt" IS NOT NULL AND "paymentConfirmedAt" IS NOT NULL AND "paymentConfirmedByStaffId" IS NOT NULL AND "paymentConfirmationSource" IS NOT NULL)`,
)
@Check(
    'CK_orders_fulfillment_method',
    `"fulfillmentMethod" IS NULL OR "fulfillmentMethod" IN ('pickup','courier','transport_company','service_only','mixed')`,
)
@Check(
    'CK_orders_fulfillment_shape',
    `("fulfilledAt" IS NULL AND "fulfilledByStaffId" IS NULL AND "fulfillmentMethod" IS NULL AND "fulfillmentRecipientName" IS NULL AND "fulfillmentCarrierName" IS NULL AND "fulfillmentTrackingNumber" IS NULL AND "fulfillmentComment" IS NULL) OR ("fulfilledAt" IS NOT NULL AND "fulfilledByStaffId" IS NOT NULL AND "fulfillmentMethod" IS NOT NULL)`,
)
@Check(
    'CK_orders_fulfillment_optional_strings',
    `("fulfillmentRecipientName" IS NULL OR btrim("fulfillmentRecipientName") <> '') AND ("fulfillmentCarrierName" IS NULL OR btrim("fulfillmentCarrierName") <> '') AND ("fulfillmentTrackingNumber" IS NULL OR btrim("fulfillmentTrackingNumber") <> '') AND ("fulfillmentComment" IS NULL OR btrim("fulfillmentComment") <> '')`,
)
@Check(
    'CK_orders_fulfillment_conditions',
    `("fulfillmentMethod" <> 'transport_company' OR ("fulfillmentCarrierName" IS NOT NULL AND btrim("fulfillmentCarrierName") <> '')) AND ("fulfillmentMethod" <> 'service_only' OR ("fulfillmentComment" IS NOT NULL AND btrim("fulfillmentComment") <> '' AND "fulfillmentCarrierName" IS NULL AND "fulfillmentTrackingNumber" IS NULL)) AND ("fulfillmentMethod" <> 'mixed' OR ("fulfillmentComment" IS NOT NULL AND btrim("fulfillmentComment") <> ''))`,
)
@Check(
    'CK_orders_final_documents_delivery_method',
    `"finalDocumentsDeliveryMethod" IS NULL OR "finalDocumentsDeliveryMethod" IN ('edo','paper','mixed','not_required')`,
)
@Check(
    'CK_orders_final_document_kinds',
    `"finalDocumentKinds" IS NULL OR (cardinality("finalDocumentKinds") <= 5 AND "finalDocumentKinds" <@ ARRAY['upd','invoice_factura','torg12','act','other']::varchar[])`,
)
@Check(
    'CK_orders_completion_shape',
    `("completedAt" IS NULL AND "completedByStaffId" IS NULL AND "realizationNumber" IS NULL AND "realizationDate" IS NULL AND "finalDocumentsDeliveryMethod" IS NULL AND "finalDocumentKinds" IS NULL AND "finalDocumentsDeliveredAt" IS NULL AND "completionComment" IS NULL) OR ("completedAt" IS NOT NULL AND "completedByStaffId" IS NOT NULL AND "realizationNumber" IS NOT NULL AND btrim("realizationNumber") <> '' AND "realizationDate" IS NOT NULL AND "finalDocumentsDeliveryMethod" IS NOT NULL AND "finalDocumentKinds" IS NOT NULL AND "fulfilledAt" IS NOT NULL)`,
)
@Check(
    'CK_orders_completion_conditions',
    `("finalDocumentsDeliveryMethod" IS NULL) OR ("finalDocumentsDeliveryMethod" IN ('edo','paper','mixed') AND cardinality("finalDocumentKinds") >= 1 AND "finalDocumentsDeliveredAt" IS NOT NULL) OR ("finalDocumentsDeliveryMethod" = 'not_required' AND cardinality("finalDocumentKinds") = 0 AND "finalDocumentsDeliveredAt" IS NULL AND "completionComment" IS NOT NULL AND btrim("completionComment") <> '')`,
)
@Check(
    'CK_orders_completion_other_comment',
    `"finalDocumentKinds" IS NULL OR NOT ('other' = ANY("finalDocumentKinds")) OR ("completionComment" IS NOT NULL AND btrim("completionComment") <> '')`,
)
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

    @Column({ type: 'integer', nullable: true })
    assignedManagerId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'assignedManagerId',
        foreignKeyConstraintName: 'FK_orders_assigned_manager',
    })
    assignedManager: AdminUserEntity | null;

    @Column({ type: 'timestamp', nullable: true })
    assignedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    confirmedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    invoiceIssuedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    paymentReceivedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    paymentConfirmedAt: Date | null;

    @Column({ type: 'integer', nullable: true })
    paymentConfirmedByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'paymentConfirmedByStaffId',
        foreignKeyConstraintName: 'FK_orders_payment_confirmed_by_staff',
    })
    paymentConfirmedByStaff: AdminUserEntity | null;

    @Column({ type: 'varchar', length: 32, nullable: true })
    paymentConfirmationSource: OrderPaymentSource | null;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    paymentConfirmationComment: string | null;

    @Column({ type: 'timestamp', nullable: true })
    fulfilledAt: Date | null;

    @Column({ type: 'integer', nullable: true })
    fulfilledByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'fulfilledByStaffId',
        foreignKeyConstraintName: 'FK_orders_fulfilled_by_staff',
    })
    fulfilledByStaff: AdminUserEntity | null;

    @Column({ type: 'varchar', length: 32, nullable: true })
    fulfillmentMethod: OrderFulfillmentMethod | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    fulfillmentRecipientName: string | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    fulfillmentCarrierName: string | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    fulfillmentTrackingNumber: string | null;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    fulfillmentComment: string | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    @Column({ type: 'integer', nullable: true })
    completedByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'completedByStaffId',
        foreignKeyConstraintName: 'FK_orders_completed_by_staff',
    })
    completedByStaff: AdminUserEntity | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    realizationNumber: string | null;

    @Column({ type: 'date', nullable: true })
    realizationDate: string | null;

    @Column({ type: 'varchar', length: 32, nullable: true })
    finalDocumentsDeliveryMethod: OrderFinalDocumentDeliveryMethod | null;

    @Column({ type: 'varchar', array: true, nullable: true })
    finalDocumentKinds: OrderFinalDocumentKind[] | null;

    @Column({ type: 'timestamp', nullable: true })
    finalDocumentsDeliveredAt: Date | null;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    completionComment: string | null;

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

    @OneToOne(() => OrderQuoteEntity, (quote) => quote.order)
    quote: OrderQuoteEntity | null;

    @OneToMany(() => OrderDocumentEntity, (document) => document.order)
    documents: OrderDocumentEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
