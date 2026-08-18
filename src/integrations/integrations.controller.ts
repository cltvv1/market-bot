import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IntegrationImportDto } from './dto/integration-import.dto';
import { IntegrationBridgeGuard } from './integration-bridge.guard';
import { IntegrationsService } from './integrations.service';

@Controller('internal/integrations')
@UseGuards(IntegrationBridgeGuard)
export class IntegrationsController {
    constructor(private readonly integrations: IntegrationsService) {}

    @Post('import')
    importBatch(@Body() body: IntegrationImportDto) {
        return this.integrations.importBatch(body);
    }
}
