import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AssetsService } from './assets.service';

interface ClientAssetIdentity {
    platform?: UserPlatform;
    chatId?: string;
    organizationId?: number;
}

interface CashRegisterBody extends ClientAssetIdentity {
    model?: string;
    serialNumber?: string;
    registrationNumber?: string;
    fnSerialNumber?: string;
    ofdName?: string;
    registeredAt?: string;
}

interface FiscalDriveBody extends ClientAssetIdentity {
    cashRegisterId?: number;
    serialNumber?: string;
    validFrom?: string;
    validUntil?: string;
    source?: 'manual' | 'atol_api' | 'ofd_api';
}

interface OfdSubscriptionBody extends ClientAssetIdentity {
    cashRegisterId?: number;
    provider?: string;
    contractNumber?: string;
    validFrom?: string;
    validUntil?: string;
    status?: 'active' | 'expired' | 'unknown';
    source?: 'manual' | 'atol_api' | 'ofd_api';
}

@Controller('api/client/organizations/:organizationId/assets')
@ApiTags('assets')
export class AssetsController {
    constructor(private readonly assetsService: AssetsService) { }

    @Get()
    getAssets(
        @Param('organizationId') organizationId: string,
        @Query('platform') platform?: UserPlatform,
        @Query('chatId') chatId?: string,
    ) {
        const identity = this.parseIdentity({ platform, chatId, organizationId: Number(organizationId) });
        return this.assetsService.getOrganizationAssets(identity.chatId, identity.platform, identity.organizationId);
    }

    @Post('cash-registers')
    upsertCashRegister(@Param('organizationId') organizationId: string, @Body() body: CashRegisterBody) {
        const identity = this.parseIdentity({ ...body, organizationId: Number(organizationId) });
        return this.assetsService.upsertCashRegister({
            ...identity,
            model: body.model,
            serialNumber: body.serialNumber ?? '',
            registrationNumber: body.registrationNumber,
            fnSerialNumber: body.fnSerialNumber,
            ofdName: body.ofdName,
            registeredAt: body.registeredAt,
        });
    }

    @Post('fiscal-drives')
    upsertFiscalDrive(@Param('organizationId') organizationId: string, @Body() body: FiscalDriveBody) {
        const identity = this.parseIdentity({ ...body, organizationId: Number(organizationId) });
        const cashRegisterId = this.parsePositiveInteger(body.cashRegisterId, 'cashRegisterId');

        return this.assetsService.upsertFiscalDrive({
            ...identity,
            cashRegisterId,
            serialNumber: body.serialNumber ?? '',
            validFrom: body.validFrom,
            validUntil: body.validUntil,
            source: body.source,
        });
    }

    @Post('ofd-subscriptions')
    upsertOfdSubscription(@Param('organizationId') organizationId: string, @Body() body: OfdSubscriptionBody) {
        const identity = this.parseIdentity({ ...body, organizationId: Number(organizationId) });

        return this.assetsService.upsertOfdSubscription({
            ...identity,
            cashRegisterId: body.cashRegisterId,
            provider: body.provider ?? '',
            contractNumber: body.contractNumber,
            validFrom: body.validFrom,
            validUntil: body.validUntil,
            status: body.status,
            source: body.source,
        });
    }

    private parseIdentity(input: ClientAssetIdentity) {
        const platform = input.platform ?? 'web';
        if (platform !== 'telegram' && platform !== 'max' && platform !== 'web') {
            throw new BadRequestException('Valid platform is required');
        }

        const chatId = input.chatId?.trim();
        if (!chatId) {
            throw new BadRequestException('chatId is required');
        }

        const organizationId = this.parsePositiveInteger(input.organizationId, 'organizationId');

        return { platform, chatId, organizationId };
    }

    private parsePositiveInteger(value: number | undefined, fieldName: string) {
        const numberValue = Number(value);
        if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
            throw new BadRequestException(`${fieldName} must be a positive integer`);
        }

        return numberValue;
    }
}
