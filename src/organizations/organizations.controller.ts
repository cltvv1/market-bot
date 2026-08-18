import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import {
    LinkOrganizationDto,
    OrganizationAccessPublicResponseDto,
} from './dto/organization-api.dto';
import { OrganizationsService } from './organizations.service';
import { RateLimit } from 'src/security/rate-limit';
import { OrganizationAccessService } from './organization-access.service';
import { PositiveIdParamDto } from 'src/admin/dto/admin-api.dto';

@Controller('api/client/organizations')
@ApiTags('organizations')
@UseGuards(WebSessionGuard)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
        private readonly organizationAccessService: OrganizationAccessService,
    ) {}

    @Get()
    @RateLimit('public-sensitive-read', 60, 60)
    getMyOrganizations(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.organizationsService.getUserOrganizations(
            session.chatId,
            'web',
        );
    }

    @Post('link-by-inn')
    @RateLimit('public-form', 30, 600)
    linkByInn(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: LinkOrganizationDto,
    ) {
        return this.organizationAccessService.submit({
            chatId: session.chatId,
            platform: 'web',
            userName: body.name,
            inn: body.inn,
            kpp: body.kpp,
            organizationName: body.organizationName,
            submittedName: body.name,
            submittedPhone: body.phone,
            submittedEmail: body.email,
            comment: body.comment,
        });
    }

    @Get('access-requests')
    @RateLimit('public-sensitive-read', 60, 60)
    @ApiOkResponse({ type: OrganizationAccessPublicResponseDto, isArray: true })
    listAccessRequests(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.organizationAccessService.listOwn(session.chatId, 'web');
    }

    @Get('access-requests/:id')
    @RateLimit('public-sensitive-read', 60, 60)
    @ApiOkResponse({ type: OrganizationAccessPublicResponseDto })
    getAccessRequest(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.organizationAccessService.getOwn(
            session.chatId,
            'web',
            Number(params.id),
        );
    }

    @Post('access-requests/:id/cancel')
    @RateLimit('public-form', 30, 600)
    @ApiCreatedResponse({ type: OrganizationAccessPublicResponseDto })
    cancelAccessRequest(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.organizationAccessService.cancelOwn(
            session.chatId,
            'web',
            Number(params.id),
        );
    }
}
