import {
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
} from 'typeorm';
import { ServiceOpportunityEntity } from './service-opportunity.entity';
import { ExternalObservationEntity } from './external-observation.entity';

@Entity('opportunity_observations')
export class OpportunityObservationEntity {
    @PrimaryColumn({ type: 'integer' })
    opportunityId: number;

    @ManyToOne(() => ServiceOpportunityEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'opportunityId',
        foreignKeyConstraintName: 'FK_opportunity_observations_opportunity',
    })
    opportunity: ServiceOpportunityEntity;

    @PrimaryColumn({ type: 'bigint' })
    observationId: string;

    @ManyToOne(() => ExternalObservationEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'observationId',
        foreignKeyConstraintName: 'FK_opportunity_observations_observation',
    })
    observation: ExternalObservationEntity;

    @CreateDateColumn()
    createdAt: Date;
}
