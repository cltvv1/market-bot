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
import type { ServiceFormSchema } from '../service-form.types';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { ServiceFormDefinitionEntity } from './service-form-definition.entity';

export type ServiceFormVersionStatus = 'draft' | 'published' | 'retired';

@Entity('service_form_versions')
@Unique('UQ_service_form_version', ['definitionId', 'version'])
@Index('IDX_service_form_versions_definition_status', [
    'definitionId',
    'status',
])
@Index('UQ_service_form_published', ['definitionId'], {
    unique: true,
    where: '"status" = \'published\'',
})
@Check(
    'CK_service_form_version_status',
    `"status" IN ('draft','published','retired')`,
)
export class ServiceFormVersionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    definitionId: number;

    @ManyToOne(() => ServiceFormDefinitionEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'definitionId',
        foreignKeyConstraintName: 'FK_service_form_version_definition',
    })
    definition: ServiceFormDefinitionEntity;

    @Column()
    version: number;

    @Column({ type: 'varchar', default: 'draft' })
    status: ServiceFormVersionStatus;

    @Column({ type: 'jsonb' })
    schema: ServiceFormSchema;

    @Column({ type: 'varchar', nullable: true })
    handlerKey: string | null;

    @Column({ type: 'timestamp', nullable: true })
    publishedAt: Date | null;

    @Column({ type: 'integer', nullable: true })
    createdByStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'createdByStaffId',
        foreignKeyConstraintName: 'FK_service_form_version_creator',
    })
    createdByStaff: AdminUserEntity | null;

    @CreateDateColumn()
    createdAt: Date;
}
