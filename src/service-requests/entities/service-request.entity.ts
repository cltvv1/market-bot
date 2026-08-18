import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';

export type ServiceRequestStatus =
    | 'draft'
    | 'price_confirmed'
    | 'review_required'
    | 'invoice_required'
    | 'waiting_payment'
    | 'paid'
    | 'scheduled'
    | 'completed'
    | 'cancelled';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

@Entity('service_requests')
@Index('IDX_service_requests_assigned_engineer', ['assignedEngineerId'])
@Index('IDX_service_invoice_file', ['invoiceStoredFileId'])
@Index('IDX_service_payment_proof_file', ['paymentProofFileId'])
export class ServiceRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    serviceTypeId: number;

    @Column()
    serviceTypeCode: string;

    @Column()
    serviceTypeTitle: string;

    @Column({ nullable: true })
    userId: number;

    @Column({ nullable: true })
    organizationId: number;

    @Column({ type: 'varchar', default: 'web' })
    platform: UserPlatform;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar', default: 'draft' })
    status: ServiceRequestStatus;

    @Column({ default: 0 })
    currentStep: number;

    @Column({ type: 'jsonb', default: {} })
    answers: Record<string, unknown>;

    @Column({ type: 'integer', nullable: true })
    calculatedPrice: number | null;

    @Column({ type: 'varchar', nullable: true })
    invoiceFileId: string | null;

    @Column({ type: 'varchar', nullable: true })
    invoiceFileName: string | null;

    @Column({ type: 'integer', nullable: true })
    invoiceStoredFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'invoiceStoredFileId', foreignKeyConstraintName: 'FK_service_invoice_file' })
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
    @JoinColumn({ name: 'generatedConsentFileId', foreignKeyConstraintName: 'FK_service_generated_consent_file' })
    generatedConsentFile: StoredFileEntity | null;

    @Column({ type: 'integer', nullable: true })
    signedConsentFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'signedConsentFileId', foreignKeyConstraintName: 'FK_service_signed_consent_file' })
    signedConsentFile: StoredFileEntity | null;

    @Column({ type: 'varchar', nullable: true })
    visitAddress: string | null;

    @Column({ type: 'timestamp', nullable: true })
    visitTime: Date | null;

    @Column({ type: 'text', nullable: true })
    operatorComment: string | null;

    @Column({ type: 'varchar', nullable: true })
    responsibleOperatorId: string | null;

    @Column({ type: 'varchar', nullable: true })
    executorName: string | null;

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
