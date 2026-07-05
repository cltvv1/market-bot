import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { RegistrationType } from '../registration.types';


@Entity('registration_requests')
export class RegistrationRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar', default: 'telegram' })
    platform: UserPlatform;

    @Column({ nullable: true })
    userId: number;

    @Column({ nullable: true })
    organizationId: number;

    @Column({
        type: 'enum',
        enum: RegistrationType,
        default: RegistrationType.REGISTRATION,
    })
    type: RegistrationType;

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
    phoneToCall?: string;

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

    @Column({ nullable: true })
    pdfPath: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
