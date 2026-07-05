import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { ServiceRequestsService } from './service-requests.service';

interface ClientIdentityBody {
    platform?: UserPlatform;
    chatId?: string;
    username?: string;
    name?: string;
    organizationId?: number;
}

@Controller('api/client/service-requests')
@ApiTags('service-requests')
export class ServiceRequestsController {
    constructor(private readonly serviceRequestsService: ServiceRequestsService) { }

    @Get('types')
    getTypes() {
        return this.serviceRequestsService.getServiceTypes();
    }

    @Get()
    getClientRequests(@Query('platform') platform: UserPlatform = 'web', @Query('chatId') chatId?: string) {
        return this.serviceRequestsService.listForClient(this.parseIdentity({ platform, chatId }));
    }

    @Post('start')
    start(@Body() body: ClientIdentityBody & { serviceTypeCode?: string }) {
        if (!body.serviceTypeCode?.trim()) {
            throw new BadRequestException('serviceTypeCode is required');
        }

        return this.serviceRequestsService.start(this.parseIdentity(body), body.serviceTypeCode.trim());
    }

    @Post(':id/answers')
    answer(@Param('id') id: string, @Body() body: ClientIdentityBody & { value?: string }) {
        const value = body.value?.trim();
        if (!value) {
            throw new BadRequestException('Answer value is required');
        }

        return this.serviceRequestsService.answer(this.parseIdentity(body), Number(id), value);
    }

    @Post(':id/confirm-price')
    confirmPrice(@Param('id') id: string, @Body() body: ClientIdentityBody) {
        return this.serviceRequestsService.confirmPrice(this.parseIdentity(body), Number(id));
    }

    private parseIdentity(body: ClientIdentityBody) {
        const platform = body.platform ?? 'web';
        if (platform !== 'telegram' && platform !== 'max' && platform !== 'web') {
            throw new BadRequestException('Valid platform is required');
        }

        const chatId = body.chatId?.trim();
        if (!chatId) {
            throw new BadRequestException('chatId is required');
        }

        return {
            platform,
            chatId,
            username: body.username?.trim() || undefined,
            name: body.name?.trim() || undefined,
            organizationId: this.parseOptionalNumber(body.organizationId, 'organizationId'),
        };
    }

    private parseOptionalNumber(value: number | undefined, fieldName: string) {
        if (value === undefined || value === null) {
            return undefined;
        }

        const numberValue = Number(value);
        if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
            throw new BadRequestException(`${fieldName} must be a positive integer`);
        }

        return numberValue;
    }
}
