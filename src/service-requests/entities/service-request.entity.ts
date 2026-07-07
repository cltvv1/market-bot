import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type ServiceRequestStatus =
    | 'draft'
    | 'price_confirmed'
    | 'invoice_required'
    | 'waiting_payment'
    | 'paid'
    | 'scheduled'
    | 'completed'
    | 'cancelled';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

@Entity('service_requests')
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

    @Column({ type: 'varchar', default: 'normal' })
    priority: ServiceRequestPriority;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
