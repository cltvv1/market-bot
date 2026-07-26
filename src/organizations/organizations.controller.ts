import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { LinkOrganizationDto } from './dto/organization-api.dto';
import { OrganizationsService } from './organizations.service';
import { RateLimit } from 'src/security/rate-limit';

@Controller('api/client/organizations')
@ApiTags('organizations')
@UseGuards(WebSessionGuard)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
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
        return this.organizationsService.linkUserByInn({
            chatId: session.chatId,
            platform: 'web',
            userName: body.name,
            inn: body.inn,
            kpp: body.kpp,
            ogrn: body.ogrn,
            name: body.organizationName,
            legalAddress: body.legalAddress,
            actualAddress: body.actualAddress,
            taxSystem: body.taxSystem,
            role: body.role,
        });
    }
}
