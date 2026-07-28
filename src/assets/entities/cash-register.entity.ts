import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type CashRegisterStatus = 'active' | 'inactive' | 'archived';

@Entity('cash_registers')
@Unique(['organizationId', 'serialNumber'])
export class CashRegisterEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    organizationId: number;

    @Column({ type: 'varchar', nullable: true })
    model: string | null;

    @Column({ type: 'varchar' })
    serialNumber: string;

    @Column({ type: 'varchar', nullable: true })
    registrationNumber: string | null;

    @Column({ type: 'varchar', nullable: true })
    fnSerialNumber: string | null;

    @Column({ type: 'varchar', nullable: true })
    ofdName: string | null;

    @Column({ type: 'varchar', default: 'active' })
    status: CashRegisterStatus;

    @Column({ type: 'timestamp', nullable: true })
    registeredAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    lastSyncedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
