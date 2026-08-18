import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserPlatform } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { OrganizationEntity } from './entities/organization.entity';
import { OrganizationMemberEntity } from './entities/organization-member.entity';
import { AuditService } from 'src/audit/audit.service';

export interface UpsertOrganizationInput {
    inn: string;
    kpp?: string;
    ogrn?: string;
    name?: string;
    legalAddress?: string;
    actualAddress?: string;
    taxSystem?: string;
}

@Injectable()
export class OrganizationsService {
    constructor(
        @InjectRepository(OrganizationEntity)
        private readonly organizationsRepo: Repository<OrganizationEntity>,
        @InjectRepository(OrganizationMemberEntity)
        private readonly membersRepo: Repository<OrganizationMemberEntity>,
        private readonly usersService: UsersService,
        private readonly auditService: AuditService,
    ) {}

    async upsertByInn(input: UpsertOrganizationInput) {
        const inn = this.normalizeInn(input.inn);
        const kpp = input.kpp?.trim() || null;

        let organization = await this.organizationsRepo.findOne({
            where: { inn, kpp: kpp ?? undefined },
        });

        if (!organization && !kpp) {
            organization = await this.organizationsRepo.findOne({
                where: { inn },
            });
        }

        if (!organization) {
            organization = this.organizationsRepo.create({
                inn,
                kpp,
            });
        }

        organization.ogrn = input.ogrn?.trim() || organization.ogrn;
        organization.name = input.name?.trim() || organization.name;
        organization.legalAddress =
            input.legalAddress?.trim() || organization.legalAddress;
        organization.actualAddress =
            input.actualAddress?.trim() || organization.actualAddress;
        organization.taxSystem =
            input.taxSystem?.trim() || organization.taxSystem;

        return this.organizationsRepo.save(organization);
    }

    async findOrCreateForAccess(
        input: Pick<UpsertOrganizationInput, 'inn' | 'kpp' | 'name'>,
        manager: EntityManager,
    ) {
        const inn = this.normalizeInn(input.inn);
        const kpp = input.kpp?.trim() || null;
        const repository = manager.getRepository(OrganizationEntity);
        let organization = await repository.findOne({
            where: kpp ? { inn, kpp } : { inn },
        });
        if (organization) return organization;

        organization = repository.create({
            inn,
            kpp,
            name: input.name?.trim() || null,
        });
        return repository.save(organization);
    }

    async getUserOrganizations(chatId: string, platform: UserPlatform) {
        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            platform,
        );

        return this.membersRepo.find({
            where: { userId: user.id, status: 'active' },
            relations: { organization: true },
            order: { id: 'ASC' },
        });
    }

    async assertUserOrganization(
        chatId: string,
        platform: UserPlatform,
        organizationId?: number,
    ) {
        if (!organizationId) return null;

        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            platform,
        );
        const member = await this.membersRepo.findOne({
            where: { userId: user.id, organizationId, status: 'active' },
            relations: { organization: true },
        });

        if (!member) {
            await this.auditService.record({
                actorType: 'customer',
                actorCustomerId: user.id,
                action: 'organization_access.denied',
                targetType: 'organization',
                targetId: organizationId,
                result: 'denied',
                reason: 'active_membership_required',
            });
            throw new NotFoundException(
                'Organization is not linked to this user',
            );
        }

        return member.organization;
    }

    normalizeInn(value: string) {
        const inn = value?.replace(/\D/g, '');

        if (!inn || (inn.length !== 10 && inn.length !== 12)) {
            throw new BadRequestException('INN must contain 10 or 12 digits');
        }

        return inn;
    }
}
