import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlatform } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { OrganizationEntity } from './entities/organization.entity';
import { OrganizationMemberEntity, OrganizationMemberRole } from './entities/organization-member.entity';

export interface UpsertOrganizationInput {
    inn: string;
    kpp?: string;
    ogrn?: string;
    name?: string;
    legalAddress?: string;
    actualAddress?: string;
    taxSystem?: string;
}

export interface LinkOrganizationInput extends UpsertOrganizationInput {
    chatId: string;
    platform: UserPlatform;
    userName?: string;
    username?: string;
    role?: OrganizationMemberRole;
}

@Injectable()
export class OrganizationsService {
    constructor(
        @InjectRepository(OrganizationEntity)
        private readonly organizationsRepo: Repository<OrganizationEntity>,
        @InjectRepository(OrganizationMemberEntity)
        private readonly membersRepo: Repository<OrganizationMemberEntity>,
        private readonly usersService: UsersService,
    ) { }

    async upsertByInn(input: UpsertOrganizationInput) {
        const inn = this.normalizeInn(input.inn);
        const kpp = input.kpp?.trim() || null;

        let organization = await this.organizationsRepo.findOne({
            where: { inn, kpp: kpp ?? undefined },
        });

        if (!organization && !kpp) {
            organization = await this.organizationsRepo.findOne({ where: { inn } });
        }

        if (!organization) {
            organization = this.organizationsRepo.create({
                inn,
                kpp,
            });
        }

        organization.ogrn = input.ogrn?.trim() || organization.ogrn;
        organization.name = input.name?.trim() || organization.name;
        organization.legalAddress = input.legalAddress?.trim() || organization.legalAddress;
        organization.actualAddress = input.actualAddress?.trim() || organization.actualAddress;
        organization.taxSystem = input.taxSystem?.trim() || organization.taxSystem;

        return this.organizationsRepo.save(organization);
    }

    async linkUserByInn(input: LinkOrganizationInput) {
        const user = await this.usersService.getOrCreateOrUpdate(
            input.chatId,
            input.userName,
            input.username,
            input.platform,
        );
        const organization = await this.upsertByInn(input);

        let member = await this.membersRepo.findOne({
            where: { userId: user.id, organizationId: organization.id },
        });

        if (!member) {
            member = this.membersRepo.create({
                userId: user.id,
                organizationId: organization.id,
                role: input.role ?? 'owner',
                status: 'active',
                confirmedAt: new Date(),
            });
        } else if (member.status !== 'active') {
            member.status = 'active';
            member.confirmedAt = new Date();
        }

        member.role = input.role ?? member.role;
        member = await this.membersRepo.save(member);

        return { user, organization, member };
    }

    async getUserOrganizations(chatId: string, platform: UserPlatform) {
        const user = await this.usersService.getOrCreateOrUpdate(chatId, undefined, undefined, platform);

        return this.membersRepo.find({
            where: { userId: user.id, status: 'active' },
            relations: { organization: true },
            order: { id: 'ASC' },
        });
    }

    async assertUserOrganization(chatId: string, platform: UserPlatform, organizationId?: number) {
        if (!organizationId) return null;

        const user = await this.usersService.getOrCreateOrUpdate(chatId, undefined, undefined, platform);
        const member = await this.membersRepo.findOne({
            where: { userId: user.id, organizationId, status: 'active' },
            relations: { organization: true },
        });

        if (!member) {
            throw new NotFoundException('Organization is not linked to this user');
        }

        return member.organization;
    }

    private normalizeInn(value: string) {
        const inn = value?.replace(/\D/g, '');

        if (!inn || (inn.length !== 10 && inn.length !== 12)) {
            throw new BadRequestException('INN must contain 10 or 12 digits');
        }

        return inn;
    }
}
