import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type AssetDataSource = 'manual' | 'atol_api' | 'ofd_api';

@Entity('fiscal_drives')
@Unique(['cashRegisterId', 'serialNumber'])
export class FiscalDriveEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    organizationId: number;

    @Column()
    cashRegisterId: number;

    @Column({ type: 'varchar' })
    serialNumber: string;

    @Column({ type: 'timestamp', nullable: true })
    validFrom: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    validUntil: Date | null;

    @Column({ type: 'varchar', default: 'manual' })
    source: AssetDataSource;

    @Column({ type: 'timestamp', nullable: true })
    lastCheckedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
