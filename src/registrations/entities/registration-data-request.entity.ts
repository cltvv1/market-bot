import {
    Column,
    Check,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { RegistrationRequestEntity } from './registration.entity';
import { RegistrationRequirementEntity } from './registration-requirement.entity';

export type RegistrationDataRequestStatus =
    | 'open'
    | 'delivered'
    | 'delivery_failed'
    | 'answered'
    | 'closed';

@Entity('registration_data_requests')
@Index('UQ_registration_data_request_open', ['requirementId'], {
    unique: true,
    where: `"closedAt" IS NULL`,
})
@Index('UQ_registration_data_request_token', ['responseToken'], {
    unique: true,
})
@Check(
    'CK_registration_data_request_status',
    `"status" IN ('open','delivered','delivery_failed','answered','closed')`,
)
export class RegistrationDataRequestEntity {
    @PrimaryGeneratedColumn() id: number;
    @Column() registrationId: number;
    @ManyToOne(() => RegistrationRequestEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'registrationId',
        foreignKeyConstraintName: 'FK_registration_data_request_registration',
    })
    registration: RegistrationRequestEntity;
    @Column() requirementId: number;
    @ManyToOne(() => RegistrationRequirementEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'requirementId',
        foreignKeyConstraintName: 'FK_registration_data_request_requirement',
    })
    requirement: RegistrationRequirementEntity;
    @Column() requestedByStaffId: number;
    @ManyToOne(() => AdminUserEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'requestedByStaffId',
        foreignKeyConstraintName: 'FK_registration_data_request_staff',
    })
    requestedByStaff: AdminUserEntity;
    @Column({ type: 'text' }) requestText: string;
    @Column({ type: 'varchar' }) targetChannel: string;
    @Column({ type: 'uuid' }) responseToken: string;
    @Column({ type: 'varchar', default: 'open' })
    status: RegistrationDataRequestStatus;
    @CreateDateColumn() createdAt: Date;
    @Column({ type: 'timestamp', nullable: true }) deliveredAt: Date | null;
    @Column({ type: 'text', nullable: true }) deliveryError: string | null;
    @Column({ type: 'timestamp', nullable: true }) activatedAt: Date | null;
    @Column({ type: 'timestamp', nullable: true }) answeredAt: Date | null;
    @Column({ type: 'timestamp', nullable: true }) closedAt: Date | null;
}
