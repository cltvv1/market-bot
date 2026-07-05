import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('service_request_events')
export class ServiceRequestEventEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    serviceRequestId: number;

    @Column({ type: 'varchar' })
    type: string;

    @Column({ type: 'varchar', nullable: true })
    actor: string | null;

    @Column({ type: 'text', nullable: true })
    message: string | null;

    @Column({ type: 'jsonb', nullable: true })
    payload: Record<string, unknown> | null;

    @CreateDateColumn()
    createdAt: Date;
}
