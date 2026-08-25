import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { ServiceFormVersionEntity } from './service-form-version.entity';

export type ServiceRequestStatus =
    | 'draft'
    | 'submitted'
    | 'price_confirmed'
    | 'review_required'
    | 'clarification_required'
    | 'invoice_required'
    | 'waiting_payment'
    | 'paid'
    | 'scheduled'
    | 'in_progress'
    | 'completed'
    | 'closed'
    | 'cancelled';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ServiceRequestSource =
    | 'web'
    | 'telegram'
    | 'max'
    | 'admin'
    | 'phone'
    | 'integration';
export type ServiceRequestCustomerStatus =
    | 'received'
    | 'clarification_required'
    | 'accepted'
    | 'waiting_for_customer'
    | 'scheduled'
    | 'completed'
    | 'closed'
    | 'cancelled';

export interface ServiceRequestContactSnapshot {
    name: string;
    phone?: string;
    email?: string;
    messenger?: { platform: UserPlatform; chatId: string };
    preferredChannel: 'phone' | 'email' | 'telegram' | 'max' | 'web';
}

@Entity('service_requests')
@Index('IDX_service_requests_assigned_engineer', ['assignedEngineerId'])
@Index('IDX_service_invoice_file', ['invoiceStoredFileId'])
@Index('IDX_service_payment_proof_file', ['paymentProofFileId'])
@Index('IDX_service_requests_form_version', ['formVersionId'])
@Index('IDX_service_requests_cash_register', ['cashRegisterId'])
@Index('IDX_service_requests_responsible_staff', ['responsibleOperatorStaffId'])
@Index(
    'IDX_service_requests_submit_idempotency',
    ['userId', 'submitIdempotencyKey'],
    {
        unique: true,
        where: '"submitIdempotencyKey" IS NOT NULL',
    },
)
@Index(
    'UQ_service_requests_channel_active_draft',
    ['platform', 'chatId', 'serviceTypeCode'],
    {
        unique: true,
        where: `"status" = 'draft' AND "source" IN ('telegram', 'max')`,
    },
)
export class ServiceRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', unique: true })
    requestNumber: string;

    @Column()
    serviceTypeId: number;

    @Column()
    serviceTypeCode: string;

    @Column()
    serviceTypeTitle: string;

    @Column({ type: 'integer' })
    formVersionId: number;

    @ManyToOne(() => ServiceFormVersionEntity, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'formVersionId',
        foreignKeyConstraintName: 'FK_service_requests_form_version',
    })
    formVersion: ServiceFormVersionEntity;

    @Column({ nullable: true })
    userId: number;

    @Column({ nullable: true })
    organizationId: number;

    @Column({ type: 'integer', nullable: true })
    cashRegisterId: number | null;

    @ManyToOne(() => CashRegisterEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'cashRegisterId',
        foreignKeyConstraintName: 'FK_service_requests_cash_register',
    })
    cashRegister: CashRegisterEntity | null;

    @Column({ type: 'varchar', default: 'web' })
    platform: UserPlatform;

    @Column({ type: 'varchar' })
    source: ServiceRequestSource;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar', default: 'draft' })
    status: ServiceRequestStatus;

    @Column({ type: 'varchar', default: 'received' })
    customerStatus: ServiceRequestCustomerStatus;

    @Column({ default: 0 })
    currentStep: number;

    @Column({ type: 'jsonb', default: {} })
    answers: Record<string, unknown>;

    @Column({ type: 'jsonb', nullable: true })
    contactSnapshot: ServiceRequestContactSnapshot | null;

    @Column({ type: 'jsonb', nullable: true })
    organizationSnapshot: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    locationSnapshot: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    equipmentSnapshot: Record<string, unknown> | null;

    @Column({ type: 'integer', nullable: true })
    calculatedPrice: number | null;

    @Column({ type: 'integer', nullable: true })
    invoiceStoredFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'invoiceStoredFileId',
        foreignKeyConstraintName: 'FK_service_invoice_file',
    })
    invoiceStoredFile: StoredFileEntity | null;

    @Column({ type: 'integer', nullable: true })
    paymentProofFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'paymentProofFileId',
        foreignKeyConstraintName: 'FK_service_payment_proof_file',
    })
    paymentProofFile: StoredFileEntity | null;

    @Column({ type: 'integer', nullable: true })
    generatedConsentFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'generatedConsentFileId',
        foreignKeyConstraintName: 'FK_service_generated_consent_file',
    })
    generatedConsentFile: StoredFileEntity | null;

    @Column({ type: 'integer', nullable: true })
    signedConsentFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'signedConsentFileId',
        foreignKeyConstraintName: 'FK_service_signed_consent_file',
    })
    signedConsentFile: StoredFileEntity | null;

    @Column({ type: 'varchar', nullable: true })
    visitAddress: string | null;

    @Column({ type: 'timestamp', nullable: true })
    visitTime: Date | null;

    @Column({ type: 'text', nullable: true })
    operatorComment: string | null;

    @Column({ type: 'integer', nullable: true })
    responsibleOperatorStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'responsibleOperatorStaffId',
        foreignKeyConstraintName: 'FK_service_requests_responsible_staff',
    })
    responsibleOperatorStaff: AdminUserEntity | null;

    @Column({ type: 'integer', nullable: true })
    assignedEngineerId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'assignedEngineerId',
        foreignKeyConstraintName: 'FK_service_requests_assigned_engineer',
    })
    assignedEngineer: AdminUserEntity | null;

    @Column({ type: 'varchar', default: 'normal' })
    priority: ServiceRequestPriority;

    @Column({ type: 'varchar', nullable: true, unique: true })
    publicTokenHash: string | null;

    @Column({ type: 'varchar', nullable: true })
    submitIdempotencyKey: string | null;

    @Column({ type: 'timestamp', nullable: true })
    submittedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    closedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    cancelledAt: Date | null;

    @VersionColumn()
    version: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
