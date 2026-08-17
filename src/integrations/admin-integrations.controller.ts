import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from 'src/admin/admin-auth.guard';
import {
    CurrentAdmin,
    RequirePermissions,
} from 'src/admin/admin-auth.decorators';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AuditService } from 'src/audit/audit.service';
import {
    CreateIntegrationExclusionDto,
    OpportunityListQueryDto,
    UpdateIntegrationExclusionDto,
    UpdateOpportunityDto,
} from './dto/integration-import.dto';
import { IntegrationsService } from './integrations.service';
import { IntegrationCoordinatorService } from './integration-coordinator.service';
import {
    INTEGRATION_PROVIDERS,
    type IntegrationProvider,
} from './integration.types';

@Controller('admin/api')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminIntegrationsController {
    constructor(
        private readonly integrations: IntegrationsService,
        private readonly audit: AuditService,
        private readonly coordinator: IntegrationCoordinatorService,
    ) {}

    @Get('integration-runs')
    @RequirePermissions('integrations.read')
    listRuns() {
        return this.integrations.listRuns();
    }

    @Get('integration-errors')
    @RequirePermissions('integrations.read')
    listErrors(@Query('runId') runId?: string) {
        return this.integrations.listErrors(runId);
    }

    @Get('integration-exclusions')
    @RequirePermissions('integrations.read')
    listExclusions() {
        return this.integrations.listExclusions();
    }

    @Post('integration-exclusions')
    @RequirePermissions('integrations.manage')
    async createExclusion(
        @CurrentAdmin() admin: AdminPrincipal,
        @Body() body: CreateIntegrationExclusionDto,
    ) {
        const result = await this.integrations.createExclusion(body);
        await this.audit.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'integration.exclusion.create',
            targetType: 'integration_exclusion',
            targetId: String(result.id),
            metadata: {
                provider: result.provider,
                observationType: result.observationType,
            },
        });
        return result;
    }

    @Post('integration-exclusions/:id')
    @RequirePermissions('integrations.manage')
    async updateExclusion(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param('id') id: string,
        @Body() body: UpdateIntegrationExclusionDto,
    ) {
        const result = await this.integrations.updateExclusion(
            Number(id),
            body,
        );
        await this.audit.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'integration.exclusion.update',
            targetType: 'integration_exclusion',
            targetId: id,
            metadata: { isActive: result.isActive },
        });
        return result;
    }

    @Get('integration-bridges')
    @RequirePermissions('integrations.read')
    bridgeHealth() {
        return this.coordinator.health();
    }

    @Post('integration-bridges/:provider/sync')
    @RequirePermissions('integrations.manage')
    async synchronize(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param('provider') providerValue: string,
    ) {
        if (
            !(INTEGRATION_PROVIDERS as readonly string[]).includes(
                providerValue,
            )
        ) {
            throw new BadRequestException('Unknown integration provider');
        }
        const provider = providerValue as IntegrationProvider;
        const result = await this.coordinator.sync(provider);
        await this.audit.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'integration.sync',
            targetType: 'integration_provider',
            targetId: provider,
        });
        return result;
    }

    @Get('opportunities')
    @RequirePermissions('opportunities.read')
    listOpportunities(@Query() query: OpportunityListQueryDto) {
        return this.integrations.listOpportunities(query);
    }

    @Get('opportunities/:id')
    @RequirePermissions('opportunities.read')
    getOpportunity(@Param('id') id: string) {
        return this.integrations.getOpportunity(Number(id));
    }

    @Post('opportunities/:id')
    @RequirePermissions('opportunities.update')
    async updateOpportunity(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param('id') id: string,
        @Body() body: UpdateOpportunityDto,
    ) {
        const result = await this.integrations.updateOpportunity(
            Number(id),
            body,
            admin.id,
        );
        await this.audit.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'opportunity.update',
            targetType: 'service_opportunity',
            targetId: id,
            metadata: { status: body.status, callbackAt: body.callbackAt },
        });
        return result;
    }

    @Post('opportunities/:id/convert')
    @RequirePermissions('opportunities.update')
    async convertOpportunity(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param('id') id: string,
    ) {
        const result = await this.integrations.convertOpportunity(
            Number(id),
            admin.id,
        );
        await this.audit.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'opportunity.convert',
            targetType: 'service_opportunity',
            targetId: id,
            metadata: { serviceRequestId: result.request.id },
        });
        return result;
    }
}
