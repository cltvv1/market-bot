import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('organizations')
@Unique(['inn', 'kpp'])
export class OrganizationEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    inn: string;

    @Column({ type: 'varchar', nullable: true })
    kpp: string | null;

    @Column({ type: 'varchar', nullable: true })
    ogrn: string | null;

    @Column({ type: 'varchar', nullable: true })
    name: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalAddress: string | null;

    @Column({ type: 'varchar', nullable: true })
    actualAddress: string | null;

    @Column({ type: 'varchar', nullable: true })
    taxSystem: string | null;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ type: 'timestamp', nullable: true })
    lastSyncedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
