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
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { ServiceRequestEntity } from './service-request.entity';

export type ServiceRequestAttachmentKind =
    | 'customer'
    | 'invoice'
    | 'payment_proof'
    | 'generated_consent'
    | 'signed_consent'
    | 'message';

@Entity('service_request_attachments')
@Index('IDX_service_request_attachments_request', ['serviceRequestId'])
@Index(
    'UQ_service_request_attachment_role',
    ['serviceRequestId', 'storedFileId', 'kind'],
    { unique: true },
)
@Check(
    'CK_service_request_attachment_kind',
    `"kind" IN ('customer','invoice','payment_proof','generated_consent','signed_consent','message')`,
)
export class ServiceRequestAttachmentEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    serviceRequestId: number;

    @ManyToOne(() => ServiceRequestEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'serviceRequestId',
        foreignKeyConstraintName: 'FK_service_request_attachment_request',
    })
    serviceRequest: ServiceRequestEntity;

    @Column()
    storedFileId: number;

    @ManyToOne(() => StoredFileEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_service_request_attachment_file',
    })
    storedFile: StoredFileEntity;

    @Column({ type: 'varchar', default: 'customer' })
    kind: ServiceRequestAttachmentKind;

    @Column({ default: true })
    customerVisible: boolean;

    @Column({ type: 'integer', nullable: true })
    uploadedByCustomerId: number | null;

    @Column({ type: 'integer', nullable: true })
    uploadedByStaffId: number | null;

    @CreateDateColumn()
    createdAt: Date;
}
