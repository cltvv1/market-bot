import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import {
    CashRegisterDto,
    FiscalDriveDto,
    OfdSubscriptionDto,
    OrganizationIdParamDto,
} from './dto/asset-api.dto';
import { AssetsService } from './assets.service';
import { RateLimit } from 'src/security/rate-limit';

@Controller('api/client/organizations/:organizationId/assets')
@ApiTags('assets')
@UseGuards(WebSessionGuard)
export class AssetsController {
    constructor(private readonly assetsService: AssetsService) {}

    @Get()
    @RateLimit('public-sensitive-read', 60, 60)
    getAssets(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: OrganizationIdParamDto,
    ) {
        return this.assetsService.getOrganizationAssets(
            session.chatId,
            'web',
            Number(params.organizationId),
        );
    }

    @Post('cash-registers')
    @RateLimit('public-form', 30, 600)
    upsertCashRegister(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: OrganizationIdParamDto,
        @Body() body: CashRegisterDto,
    ) {
        return this.assetsService.upsertCashRegister({
            chatId: session.chatId,
            platform: 'web',
            organizationId: Number(params.organizationId),
            ...body,
        });
    }

    @Post('fiscal-drives')
    @RateLimit('public-form', 30, 600)
    upsertFiscalDrive(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: OrganizationIdParamDto,
        @Body() body: FiscalDriveDto,
    ) {
        return this.assetsService.upsertFiscalDrive({
            chatId: session.chatId,
            platform: 'web',
            organizationId: Number(params.organizationId),
            ...body,
        });
    }

    @Post('ofd-subscriptions')
    @RateLimit('public-form', 30, 600)
    upsertOfdSubscription(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: OrganizationIdParamDto,
        @Body() body: OfdSubscriptionDto,
    ) {
        return this.assetsService.upsertOfdSubscription({
            chatId: session.chatId,
            platform: 'web',
            organizationId: Number(params.organizationId),
            ...body,
        });
    }
}
