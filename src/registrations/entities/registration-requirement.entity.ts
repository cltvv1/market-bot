import {
    Column,
    Check,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { RegistrationRequestEntity } from './registration.entity';
import type {
    RegistrationDataSource,
    RegistrationRequirementKind,
    RegistrationRequirementStatus,
} from '../registration.types';

@Entity('registration_requirements')
@Unique('UQ_registration_requirement_kind', ['registrationId', 'kind'])
@Index('IDX_registration_requirements_status', ['status'])
@Check(
    'CK_registration_requirement_kind',
    `"kind" IN ('kkt_serial','fiscal_drive_serial','ofd_code')`,
)
@Check(
    'CK_registration_requirement_status',
    `"status" IN ('missing','requested','provided','verified','not_required')`,
)
@Check(
    'CK_registration_requirement_source',
    `"source" IS NULL OR "source" IN ('internal_registry','customer_input','customer_photo','sold_by_vitma','operator_input','external_system','legacy')`,
)
export class RegistrationRequirementEntity {
    @PrimaryGeneratedColumn() id: number;
    @Column() registrationId: number;
    @ManyToOne(() => RegistrationRequestEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'registrationId',
        foreignKeyConstraintName: 'FK_registration_requirement_registration',
    })
    registration: RegistrationRequestEntity;
    @Column({ type: 'varchar' }) kind: RegistrationRequirementKind;
    @Column({ type: 'varchar', default: 'missing' })
    status: RegistrationRequirementStatus;
    @Column({ type: 'text', nullable: true }) value: string | null;
    @Column({ type: 'varchar', nullable: true })
    source: RegistrationDataSource | null;
    @Column({ type: 'timestamp', nullable: true }) requestedAt: Date | null;
    @Column({ type: 'timestamp', nullable: true }) providedAt: Date | null;
    @Column({ type: 'timestamp', nullable: true }) verifiedAt: Date | null;
    @Column({ type: 'integer', nullable: true }) verifiedByStaffId:
        | number
        | null;
    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'verifiedByStaffId',
        foreignKeyConstraintName: 'FK_registration_requirement_verifier',
    })
    verifiedByStaff: AdminUserEntity | null;
    @Column({ type: 'text', nullable: true }) notRequiredReason: string | null;
    @Column({ type: 'text', nullable: true }) operatorComment: string | null;
    @Column({ type: 'jsonb', nullable: true }) metadata: Record<
        string,
        unknown
    > | null;
    @VersionColumn() version: number;
    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
}
