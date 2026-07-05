import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { AssetDataSource } from './fiscal-drive.entity';

export type OfdSubscriptionStatus = 'active' | 'expired' | 'unknown';

@Entity('ofd_subscriptions')
export class OfdSubscriptionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    organizationId: number;

    @Column({ nullable: true })
    cashRegisterId: number;

    @Column({ type: 'varchar' })
    provider: string;

    @Column({ type: 'varchar', nullable: true })
    contractNumber: string | null;

    @Column({ type: 'timestamp', nullable: true })
    validFrom: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    validUntil: Date | null;

    @Column({ type: 'varchar', default: 'unknown' })
    status: OfdSubscriptionStatus;

    @Column({ type: 'varchar', default: 'manual' })
    source: AssetDataSource;

    @Column({ type: 'timestamp', nullable: true })
    lastCheckedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
