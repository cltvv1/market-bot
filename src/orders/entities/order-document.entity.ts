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
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import type { OrderDocumentStatus, OrderDocumentType } from '../order.types';
import { OrderEntity } from './order.entity';

@Entity('order_documents')
@Index(
    'UQ_order_documents_order_type_revision',
    ['orderId', 'type', 'revision'],
    { unique: true },
)
@Index('UQ_order_documents_stored_file', ['storedFileId'], { unique: true })
@Index('IDX_order_documents_order_created', ['orderId', 'createdAt', 'id'])
@Index('IDX_order_documents_order_type', ['orderId', 'type'])
@Index('UQ_order_documents_active_invoice', ['orderId'], {
    unique: true,
    where: `"type" = 'invoice' AND "status" = 'active'`,
})
@Check('CK_order_documents_type', `"type" IN ('invoice','payment_proof')`)
@Check('CK_order_documents_status', `"status" IN ('active','superseded')`)
@Check('CK_order_documents_revision_positive', `"revision" > 0`)
@Check(
    'CK_order_documents_actor_shape',
    `("type" = 'invoice' AND "uploadedByStaffId" IS NOT NULL AND "uploadedByCustomerId" IS NULL) OR ("type" = 'payment_proof' AND "uploadedByStaffId" IS NULL AND "uploadedByCustomerId" IS NOT NULL)`,
)
@Check(
    'CK_order_documents_status_shape',
    `("status" = 'active' AND "supersededAt" IS NULL) OR ("status" = 'superseded' AND "supersededAt" IS NOT NULL)`,
)
@Check(
    'CK_order_documents_payment_proof_active',
    `"type" <> 'payment_proof' OR "status" = 'active'`,
)
@Check(
    'CK_order_documents_commercial_shape',
    `("type" = 'invoice' AND "quoteRevisionSnapshot" IS NOT NULL AND "quoteRevisionSnapshot" > 0 AND "amountMinorSnapshot" IS NOT NULL AND "amountMinorSnapshot" >= 0 AND "currency" = 'RUB') OR ("type" = 'payment_proof' AND "quoteRevisionSnapshot" IS NULL AND "amountMinorSnapshot" IS NULL AND "currency" IS NULL)`,
)
export class OrderDocumentEntity {
    @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_order_documents' })
    id: number;

    @Column({ type: 'integer' })
    orderId: number;

    @ManyToOne(() => OrderEntity, (order) => order.documents, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'orderId',
        foreignKeyConstraintName: 'FK_order_documents_order',
    })
    order: OrderEntity;

    @Column({ type: 'varchar', length: 32 })
    type: OrderDocumentType;

    @Column({ type: 'varchar', length: 16, default: 'active' })
    status: OrderDocumentStatus;

    @Column({ type: 'integer' })
    revision: number;

    @Column({ type: 'integer' })
    storedFileId: number;

    @ManyToOne(() => StoredFileEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_order_documents_stored_file',
    })
    storedFile: StoredFileEntity;

    @Column({ default: true })
    customerVisible: boolean;

    @Column({ type: 'integer', nullable: true })
    uploadedByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'uploadedByStaffId',
        foreignKeyConstraintName: 'FK_order_documents_uploaded_by_staff',
    })
    uploadedByStaff: AdminUserEntity | null;

    @Column({ type: 'integer', nullable: true })
    uploadedByCustomerId: number | null;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'uploadedByCustomerId',
        foreignKeyConstraintName: 'FK_order_documents_uploaded_by_customer',
    })
    uploadedByCustomer: UserEntity | null;

    @Column({ type: 'integer', nullable: true })
    quoteRevisionSnapshot: number | null;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    amountMinorSnapshot: string | null;

    @Column({ type: 'char', length: 3, nullable: true })
    currency: 'RUB' | null;

    @Column({ type: 'timestamp', nullable: true })
    supersededAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
