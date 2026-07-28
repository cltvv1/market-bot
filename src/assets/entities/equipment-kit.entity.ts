import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type EquipmentKitStatus = 'stock' | 'sent' | 'linked' | 'registered' | 'archived';

@Entity('equipment_kits')
export class EquipmentKitEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', nullable: true })
    cashRegisterModel: string | null;

    @Column({ type: 'varchar', nullable: true })
    cashRegisterSerial: string | null;

    @Column({ type: 'varchar', nullable: true })
    fiscalDriveSerial: string | null;

    @Column({ type: 'varchar', nullable: true })
    ofdActivationCode: string | null;

    @Column({ type: 'varchar', nullable: true })
    marketplaceOrderId: string | null;

    @Column({ type: 'varchar', default: 'stock' })
    status: EquipmentKitStatus;

    @Column({ type: 'integer', nullable: true })
    registrationRequestId: number | null;

    @Column({ type: 'text', nullable: true })
    comment: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
