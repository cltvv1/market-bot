import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ServiceTypeEntity } from './service-type.entity';

@Entity('service_form_definitions')
export class ServiceFormDefinitionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    serviceTypeId: number;

    @OneToOne(() => ServiceTypeEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'serviceTypeId',
        foreignKeyConstraintName: 'FK_service_form_definition_type',
    })
    serviceType: ServiceTypeEntity;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'jsonb' })
    supportedChannels: string[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
