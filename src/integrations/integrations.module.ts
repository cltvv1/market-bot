import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { AdminModule } from 'src/admin/admin.module';
import { AuditModule } from 'src/audit/audit.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { IntegrationRunEntity } from './entities/integration-run.entity';
import { ExternalMappingEntity } from './entities/external-mapping.entity';
import { OrganizationContactEntity } from './entities/organization-contact.entity';
import { ExternalObservationEntity } from './entities/external-observation.entity';
import { ServiceOpportunityEntity } from './entities/service-opportunity.entity';
import { OpportunityObservationEntity } from './entities/opportunity-observation.entity';
import { IntegrationErrorEntity } from './entities/integration-error.entity';
import { IntegrationExclusionEntity } from './entities/integration-exclusion.entity';
import { IntegrationBridgeGuard } from './integration-bridge.guard';
import { IntegrationsController } from './integrations.controller';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationCoordinatorService } from './integration-coordinator.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrganizationEntity,
            CashRegisterEntity,
            FiscalDriveEntity,
            OfdSubscriptionEntity,
            IntegrationRunEntity,
            ExternalMappingEntity,
            OrganizationContactEntity,
            ExternalObservationEntity,
            ServiceOpportunityEntity,
            OpportunityObservationEntity,
            IntegrationErrorEntity,
            IntegrationExclusionEntity,
        ]),
        AdminModule,
        AuditModule,
        ServiceRequestsModule,
    ],
    controllers: [IntegrationsController, AdminIntegrationsController],
    providers: [
        IntegrationsService,
        IntegrationBridgeGuard,
        IntegrationCoordinatorService,
    ],
    exports: [IntegrationsService],
})
export class IntegrationsModule {}
