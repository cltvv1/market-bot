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

export type ServiceRequestMessageAuthor = 'customer' | 'staff' | 'system';
export type ServiceRequestMessageVisibility = 'customer' | 'internal';

@Entity('service_request_messages')
@Index('IDX_service_request_messages_request', [
    'serviceRequestId',
    'createdAt',
])
@Check(
    'CK_service_request_message_author',
    `"authorType" IN ('customer','staff','system')`,
)
@Check(
    'CK_service_request_message_visibility',
    `"visibility" IN ('customer','internal')`,
)
@Check(
    'CK_service_request_message_content',
    `"text" IS NOT NULL OR "storedFileId" IS NOT NULL`,
)
export class ServiceRequestMessageEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    serviceRequestId: number;

    @ManyToOne(() => ServiceRequestEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'serviceRequestId',
        foreignKeyConstraintName: 'FK_service_request_message_request',
    })
    serviceRequest: ServiceRequestEntity;

    @Column({ type: 'varchar' })
    authorType: ServiceRequestMessageAuthor;

    @Column({ type: 'integer', nullable: true })
    authorCustomerId: number | null;

    @Column({ type: 'integer', nullable: true })
    authorStaffId: number | null;

    @Column({ type: 'varchar', default: 'customer' })
    visibility: ServiceRequestMessageVisibility;

    @Column({ type: 'text', nullable: true })
    text: string | null;

    @Column({ type: 'integer', nullable: true })
    storedFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_service_request_message_file',
    })
    storedFile: StoredFileEntity | null;

    @CreateDateColumn()
    createdAt: Date;
}
