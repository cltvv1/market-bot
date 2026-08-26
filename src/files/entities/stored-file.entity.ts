import {
    Column,
    Check,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    JoinColumn,
    ManyToOne,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { UserEntity } from 'src/users/entities/user.entity';

export type StoredFileStatus =
    | 'active'
    | 'missing'
    | 'corrupt'
    | 'deleted'
    | 'pending'
    | 'rejected';

@Entity('stored_files')
@Index('UQ_stored_files_provider_object_key', ['provider', 'objectKey'], {
    unique: true,
})
@Index('IDX_stored_files_sha256', ['sha256'])
@Index('IDX_stored_files_lifecycle', ['status', 'purgeAfter'])
@Check(
    'CK_stored_files_object_key_relative',
    `left("objectKey", 1) NOT IN ('/', chr(92))
     AND "objectKey" !~ '^[A-Za-z]:'
     AND NOT ('..' = ANY(string_to_array(replace("objectKey", chr(92), '/'), '/')))`,
)
@Check('CK_stored_files_sha256', `"sha256" ~ '^[0-9a-f]{64}$'`)
@Check('CK_stored_files_size', `"sizeBytes" >= 0`)
@Check(
    'CK_stored_files_status',
    `"status" IN ('active','missing','corrupt','deleted','pending','rejected')`,
)
export class StoredFileEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', default: 'local' })
    provider: string;

    @Column({ type: 'varchar' })
    objectKey: string;

    @Column({ type: 'varchar' })
    originalName: string;

    @Column({ type: 'varchar' })
    mimeType: string;

    @Column({ type: 'bigint' })
    sizeBytes: string;

    @Column({ type: 'char', length: 64 })
    sha256: string;

    @Column({ type: 'varchar', default: 'active' })
    status: StoredFileStatus;

    @Column({ type: 'integer', nullable: true })
    createdByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'createdByStaffId',
        foreignKeyConstraintName: 'FK_stored_files_staff',
    })
    createdByStaff: AdminUserEntity | null;

    @Column({ type: 'integer', nullable: true })
    createdByCustomerId: number | null;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'createdByCustomerId',
        foreignKeyConstraintName: 'FK_stored_files_customer',
    })
    createdByCustomer: UserEntity | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;

    @Column({ type: 'timestamp', nullable: true })
    deletedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    missingAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    lastVerifiedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    corruptAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    purgeAfter: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    purgedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
