import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type CustomerActivityType =
    | 'ticket_message'
    | 'service_request_created'
    | 'service_request_answered'
    | 'service_request_price_confirmed'
    | 'service_request_invoice_attached'
    | 'service_request_payment_proof_attached'
    | 'service_request_payment_received'
    | 'service_request_visit_scheduled'
    | 'service_request_completed'
    | 'service_request_cancelled';

@Entity('customer_activities')
export class CustomerActivityEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    userId: number;

    @Column({ nullable: true })
    organizationId: number;

    @Column({ type: 'varchar', default: 'web' })
    platform: UserPlatform;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar' })
    type: CustomerActivityType;

    @Column({ type: 'varchar', nullable: true })
    title: string | null;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ nullable: true })
    ticketId: number;

    @Column({ nullable: true })
    serviceRequestId: number;

    @Column({ type: 'jsonb', nullable: true })
    payload: Record<string, unknown> | null;

    @CreateDateColumn()
    createdAt: Date;
}
