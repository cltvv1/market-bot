import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('registration_requests')
export class RegistrationRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'bigint' })
    chatId: string;

    @Column({ default: 1 })
    currentStep: number;

    @Column({ nullable: true })
    orgName?: string;

    @Column({ nullable: true })
    ogrn?: string;

    @Column({ nullable: true })
    innKpp?: string;

    @Column({ nullable: true })
    urAdress?: string;

    @Column({ nullable: true })
    kktAdress?: string;

    @Column({ nullable: true })
    kktName?: string;

    @Column({ nullable: true })
    phone?: string;

    @Column({ nullable: true })
    email?: string;

    @Column({ type: 'varchar', default: 'Нет', nullable: true })
    nds: string;

    @Column({ type: 'varchar', default: 'Нет', nullable: true })
    excise: string;

    @Column({ type: 'varchar', default: 'Нет', nullable: true })
    markirovka: string;

    @Column({ type: 'varchar', default: 'Нет', nullable: true })
    services: string;

    @Column({ type: 'varchar', default: 'Нет', nullable: true })
    strictReporting: string;

    @Column({ nullable: true })
    taxSystem: string;

    @Column({ nullable: true })
    kktModel: string;

    @Column({ type: 'text', nullable: true })
    bankReqs: string;

    @Column({ nullable: true })
    ofd: string;

    @Column({ default: false })
    isFilled: boolean;

    @Column({ nullable: true })
    pdfLink: string;

    @Column({ default: false })
    isStopped: boolean;

    @Column({ default: false })
    isProcessed: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
