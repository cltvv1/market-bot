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
} from 'typeorm';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { RegistrationRequestEntity } from './registration.entity';
import { RegistrationRequirementEntity } from './registration-requirement.entity';

export type RegistrationEvidenceKind =
    | 'customer_photo'
    | 'customer_document'
    | 'internal_registry';
export type RegistrationEvidenceVisibility = 'customer' | 'staff' | 'engineer';
export type RegistrationEvidenceActor = 'customer' | 'staff' | 'system';

@Entity('registration_evidence')
@Unique('UQ_registration_evidence_link', ['requirementId', 'storedFileId'])
@Index('IDX_registration_evidence_registration', ['registrationId'])
@Check(
    'CK_registration_evidence_kind',
    `"kind" IN ('customer_photo','customer_document','internal_registry')`,
)
@Check(
    'CK_registration_evidence_visibility',
    `"visibility" IN ('customer','staff','engineer')`,
)
@Check(
    'CK_registration_evidence_actor',
    `"uploadedByActorType" IN ('customer','staff','system')`,
)
export class RegistrationEvidenceEntity {
    @PrimaryGeneratedColumn() id: number;
    @Column() registrationId: number;
    @ManyToOne(() => RegistrationRequestEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'registrationId',
        foreignKeyConstraintName: 'FK_registration_evidence_registration',
    })
    registration: RegistrationRequestEntity;
    @Column({ type: 'integer', nullable: true }) requirementId: number | null;
    @ManyToOne(() => RegistrationRequirementEntity, {
        nullable: true,
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'requirementId',
        foreignKeyConstraintName: 'FK_registration_evidence_requirement',
    })
    requirement: RegistrationRequirementEntity | null;
    @Column() storedFileId: number;
    @ManyToOne(() => StoredFileEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_registration_evidence_file',
    })
    storedFile: StoredFileEntity;
    @Column({ type: 'varchar' }) kind: RegistrationEvidenceKind;
    @Column({ type: 'varchar', default: 'staff' })
    visibility: RegistrationEvidenceVisibility;
    @Column({ type: 'varchar' }) uploadedByActorType: RegistrationEvidenceActor;
    @Column({ type: 'integer', nullable: true }) uploadedByActorId:
        | number
        | null;
    @Column({ type: 'text', nullable: true }) comment: string | null;
    @CreateDateColumn() createdAt: Date;
    @Column({ type: 'timestamp', nullable: true }) removedAt: Date | null;
}
