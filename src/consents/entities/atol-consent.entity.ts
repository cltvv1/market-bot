import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type AtolConsentStatus =
    | 'draft'
    | 'generated'
    | 'signed_received'
    | 'completed'
    | 'cancelled';

@Entity('atol_consents')
export class AtolConsentEntity {
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

    @Column({ type: 'varchar', default: 'draft' })
    status: AtolConsentStatus;

    @Column({ default: 0 })
    currentStep: number;

    @Column({ default: 'Красноярск' })
    city: string;

    @Column({ nullable: true })
    clientName: string;

    @Column({ nullable: true })
    inn: string;

    @Column({ nullable: true })
    representativeName: string;

    @Column({ nullable: true })
    representativeBasis: string;

    @Column({ nullable: true })
    generatedPdfPath: string;

    @Column({ nullable: true })
    signedFilePath: string;

    @Column({ nullable: true })
    signedFileName: string;

    @Column({ nullable: true })
    serviceRequestId: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
