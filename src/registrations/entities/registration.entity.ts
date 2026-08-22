import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    ManyToOne,
    Index,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import type {
    OfdProvisionMode,
    RegistrationReadiness,
} from '../registration.types';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';

export type RegistrationRequestStatus =
    | 'draft'
    | 'new'
    | 'in_work'
    | 'processed';
export type RegistrationRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

@Entity('registration_requests')
@Index('IDX_registration_pdf_file', ['pdfFileId'])
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

    @Column({ type: 'integer', nullable: true })
    equipmentKitId: number | null;

    @Column({ type: 'varchar', default: 'clarification_required' })
    ofdProvisionMode: OfdProvisionMode;

    @Column({ type: 'varchar', default: 'incomplete' })
    readiness: RegistrationReadiness;

    @Column({ type: 'timestamp', nullable: true })
    readinessUpdatedAt: Date | null;

    @Column({ type: 'integer', nullable: true })
    assignedEngineerId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'assignedEngineerId',
        foreignKeyConstraintName: 'FK_registration_assigned_engineer',
    })
    assignedEngineer: AdminUserEntity | null;

    @Column({ type: 'timestamp', nullable: true })
    handedOffAt: Date | null;

    @Column({ type: 'varchar', default: 'draft' })
    status: RegistrationRequestStatus;

    @Column({ type: 'varchar', default: 'normal' })
    priority: RegistrationRequestPriority;

    @Column({ type: 'integer', nullable: true })
    pdfFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'pdfFileId',
        foreignKeyConstraintName: 'FK_registration_pdf_file',
    })
    pdfFile: StoredFileEntity | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
