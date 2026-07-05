import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { OrganizationsService } from './organizations.service';
import type { OrganizationMemberRole } from './entities/organization-member.entity';

interface OrganizationIdentityBody {
    platform?: UserPlatform;
    chatId?: string;
    username?: string;
    name?: string;
}

interface LinkOrganizationBody extends OrganizationIdentityBody {
    inn?: string;
    kpp?: string;
    ogrn?: string;
    organizationName?: string;
    legalAddress?: string;
    actualAddress?: string;
    taxSystem?: string;
    role?: OrganizationMemberRole;
}

@Controller('api/client/organizations')
@ApiTags('organizations')
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService) { }

    @Get()
    getMyOrganizations(@Query('platform') platform?: UserPlatform, @Query('chatId') chatId?: string) {
        const identity = this.parseIdentity({ platform, chatId });
        return this.organizationsService.getUserOrganizations(identity.chatId, identity.platform);
    }

    @Post('link-by-inn')
    linkByInn(@Body() body: LinkOrganizationBody) {
        const identity = this.parseIdentity(body);
        if (!body.inn?.trim()) {
            throw new BadRequestException('INN is required');
        }

        return this.organizationsService.linkUserByInn({
            chatId: identity.chatId,
            platform: identity.platform,
            username: body.username?.trim() || undefined,
            userName: body.name?.trim() || undefined,
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

    private parseIdentity(body: OrganizationIdentityBody) {
        const platform = body.platform ?? 'web';
        if (platform !== 'telegram' && platform !== 'max' && platform !== 'web') {
            throw new BadRequestException('Valid platform is required');
        }

        const chatId = body.chatId?.trim();
        if (!chatId) {
            throw new BadRequestException('chatId is required');
        }

        return { platform, chatId };
    }
}
