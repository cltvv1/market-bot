import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    ClientContextDto,
    ClientIdParamDto,
    ServiceRequestAnswerDto,
    ServiceRequestStartDto,
} from 'src/client/dto/client-api.dto';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestsService } from './service-requests.service';
import { RateLimit } from 'src/security/rate-limit';

@Controller('api/client/service-requests')
@ApiTags('service-requests')
@UseGuards(WebSessionGuard)
export class ServiceRequestsController {
    constructor(
        private readonly serviceRequestsService: ServiceRequestsService,
    ) {}

    @Get('types')
    @RateLimit('public-read', 120, 60)
    getTypes() {
        return this.serviceRequestsService.getServiceTypes();
    }

    @Get()
    @RateLimit('public-sensitive-read', 60, 60)
    getClientRequests(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.serviceRequestsService.listForClient(
            this.identity(session),
        );
    }

    @Post('start')
    @RateLimit('public-form', 30, 600)
    start(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: ServiceRequestStartDto,
    ) {
        return this.serviceRequestsService.start(
            this.identity(session, body),
            body.serviceTypeCode,
        );
    }

    @Post(':id/answers')
    @RateLimit('public-form', 30, 600)
    answer(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ServiceRequestAnswerDto,
    ) {
        return this.serviceRequestsService.answer(
            this.identity(session, body),
            Number(params.id),
            body.value,
        );
    }

    @Post(':id/confirm-price')
    @RateLimit('public-form', 30, 600)
    confirmPrice(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ClientContextDto,
    ) {
        return this.serviceRequestsService.confirmPrice(
            this.identity(session, body),
            Number(params.id),
        );
    }

    private identity(
        session: WebSessionPrincipal,
        body?: ClientContextDto,
    ) {
        return {
            platform: 'web' as const,
            chatId: session.chatId,
            name: body?.name,
            organizationId: body?.organizationId,
        };
    }
}
