import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AuditService } from 'src/audit/audit.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import {
    OrganizationAccessRequestEntity,
    type OrganizationAccessRequestStatus,
} from './entities/organization-access-request.entity';
import { OrganizationMemberEntity } from './entities/organization-member.entity';
import { OrganizationsService } from './organizations.service';

export interface SubmitOrganizationAccessInput {
    chatId: string;
    platform: UserPlatform;
    userName?: string;
    username?: string;
    inn: string;
    kpp?: string;
    organizationName?: string;
    submittedName?: string;
    submittedPhone?: string;
    submittedEmail?: string;
    comment?: string;
}

@Injectable()
export class OrganizationAccessService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly usersService: UsersService,
        private readonly organizationsService: OrganizationsService,
        private readonly auditService: AuditService,
    ) {}

    async submit(input: SubmitOrganizationAccessInput) {
        const inn = this.organizationsService.normalizeInn(input.inn);
        const user = await this.usersService.getOrCreateOrUpdate(
            input.chatId,
            input.userName,
            input.username,
            input.platform,
        );

        return this.dataSource.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `organization-access:${inn}`,
            ]);
            const organization =
                await this.organizationsService.findOrCreateForAccess(
                    { inn, kpp: input.kpp, name: input.organizationName },
                    manager,
                );
            const members = manager.getRepository(OrganizationMemberEntity);
            const existingMember = await members.findOne({
                where: {
                    organizationId: organization.id,
                    userId: user.id,
                    status: 'active',
                },
            });
            if (existingMember) {
                throw new ConflictException(
                    'Organization access is already active',
                );
            }

            const requests = manager.getRepository(
                OrganizationAccessRequestEntity,
            );
            const pending = await requests.findOne({
                where: {
                    organizationId: organization.id,
                    userId: user.id,
                    status: 'pending',
                },
                relations: { organization: true },
            });
            if (pending) {
                await this.auditService.record(
                    {
                        actorType: 'customer',
                        actorCustomerId: user.id,
                        action: 'organization_access.duplicate_submission',
                        targetType: 'organization_access_request',
                        targetId: pending.id,
                        metadata: { organizationId: organization.id },
                    },
                    manager,
                );
                return this.presentPublic(pending);
            }

            const request = await requests.save(
                requests.create({
                    organizationId: organization.id,
                    userId: user.id,
                    status: 'pending',
                    requestedRole: 'representative',
                    submittedName: input.submittedName?.trim() || null,
                    submittedPhone: input.submittedPhone?.trim() || null,
                    submittedEmail: input.submittedEmail?.trim() || null,
                    comment: input.comment?.trim() || null,
                    reviewedByStaffId: null,
                    reviewComment: null,
                    reviewedAt: null,
                    cancelledAt: null,
                    organization,
                }),
            );
            await this.auditService.record(
                {
                    actorType: 'customer',
                    actorCustomerId: user.id,
                    action: 'organization_access.submitted',
                    targetType: 'organization_access_request',
                    targetId: request.id,
                    metadata: { organizationId: organization.id },
                },
                manager,
            );
            return this.presentPublic(request);
        });
    }

    async listOwn(chatId: string, platform: UserPlatform) {
        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            platform,
        );
        const requests = await this.dataSource
            .getRepository(OrganizationAccessRequestEntity)
            .find({
                where: { userId: user.id },
                relations: { organization: true },
                order: { createdAt: 'DESC', id: 'DESC' },
            });
        return requests.map((item) => this.presentPublic(item));
    }

    async getOwn(chatId: string, platform: UserPlatform, id: number) {
        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            platform,
        );
        const request = await this.dataSource
            .getRepository(OrganizationAccessRequestEntity)
            .findOne({
                where: { id, userId: user.id },
                relations: { organization: true },
            });
        if (!request)
            throw new NotFoundException(
                'Organization access request not found',
            );
        return this.presentPublic(request);
    }

    async cancelOwn(chatId: string, platform: UserPlatform, id: number) {
        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            platform,
        );
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(
                OrganizationAccessRequestEntity,
            );
            const request = await repository.findOne({
                where: { id, userId: user.id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!request)
                throw new NotFoundException(
                    'Organization access request not found',
                );
            if (request.status === 'cancelled') {
                return this.presentPublic(
                    await this.loadPublicRequest(request.id, manager),
                );
            }
            if (request.status !== 'pending')
                throw new ConflictException(
                    'Only a pending request can be cancelled',
                );
            request.status = 'cancelled';
            request.cancelledAt = new Date();
            await repository.save(request);
            await this.auditService.record(
                {
                    actorType: 'customer',
                    actorCustomerId: user.id,
                    action: 'organization_access.cancelled',
                    targetType: 'organization_access_request',
                    targetId: request.id,
                },
                manager,
            );
            return this.presentPublic(
                await this.loadPublicRequest(request.id, manager),
            );
        });
    }

    async listForAdmin(
        status: OrganizationAccessRequestStatus | 'all' = 'pending',
    ) {
        const requests = await this.dataSource
            .getRepository(OrganizationAccessRequestEntity)
            .find({
                where: status === 'all' ? {} : { status },
                relations: {
                    organization: true,
                    user: true,
                    reviewedByStaff: true,
                },
                order: { createdAt: 'DESC', id: 'DESC' },
            });
        return requests.map((item) => this.presentAdmin(item));
    }

    async getForAdmin(id: number) {
        const request = await this.dataSource
            .getRepository(OrganizationAccessRequestEntity)
            .findOne({
                where: { id },
                relations: {
                    organization: true,
                    user: true,
                    reviewedByStaff: true,
                },
            });
        if (!request)
            throw new NotFoundException(
                'Organization access request not found',
            );
        return this.presentAdmin(request);
    }

    approve(id: number, admin: AdminPrincipal, reviewComment?: string) {
        return this.review(id, 'approved', admin, reviewComment);
    }

    reject(id: number, admin: AdminPrincipal, reviewComment?: string) {
        return this.review(id, 'rejected', admin, reviewComment);
    }

    private async review(
        id: number,
        decision: 'approved' | 'rejected',
        admin: AdminPrincipal,
        reviewComment?: string,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const requests = manager.getRepository(
                OrganizationAccessRequestEntity,
            );
            const request = await requests.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!request)
                throw new NotFoundException(
                    'Organization access request not found',
                );
            if (request.status === decision) {
                return this.presentAdmin(
                    await this.loadAdminRequest(request.id, manager),
                );
            }
            if (request.status !== 'pending') {
                throw new ConflictException(
                    `Request is already ${request.status}`,
                );
            }

            let membershipChanged = false;
            if (decision === 'approved') {
                membershipChanged = await this.ensureRepresentativeMembership(
                    request,
                    manager,
                );
            }
            request.status = decision;
            request.reviewedByStaffId = admin.id;
            request.reviewComment = reviewComment?.trim() || null;
            request.reviewedAt = new Date();
            await requests.save(request);

            await this.auditService.record(
                {
                    actorType: 'staff',
                    actorStaffId: admin.id,
                    actorSessionId: admin.sessionId,
                    action: `organization_access.${decision}`,
                    targetType: 'organization_access_request',
                    targetId: request.id,
                    metadata: {
                        organizationId: request.organizationId,
                        membershipChanged,
                    },
                },
                manager,
            );
            if (membershipChanged) {
                await this.auditService.record(
                    {
                        actorType: 'staff',
                        actorStaffId: admin.id,
                        actorSessionId: admin.sessionId,
                        action: 'organization_membership.created',
                        targetType: 'organization',
                        targetId: request.organizationId,
                        metadata: {
                            userId: request.userId,
                            role: 'representative',
                        },
                    },
                    manager,
                );
            }
            return this.presentAdmin(
                await this.loadAdminRequest(request.id, manager),
            );
        });
    }

    private async loadPublicRequest(id: number, manager: EntityManager) {
        const request = await manager
            .getRepository(OrganizationAccessRequestEntity)
            .findOne({
                where: { id },
                relations: { organization: true },
            });
        if (!request)
            throw new NotFoundException(
                'Organization access request not found',
            );
        return request;
    }

    private async loadAdminRequest(id: number, manager: EntityManager) {
        const request = await manager
            .getRepository(OrganizationAccessRequestEntity)
            .findOne({
                where: { id },
                relations: {
                    organization: true,
                    user: true,
                    reviewedByStaff: true,
                },
            });
        if (!request)
            throw new NotFoundException(
                'Organization access request not found',
            );
        return request;
    }

    private async ensureRepresentativeMembership(
        request: OrganizationAccessRequestEntity,
        manager: EntityManager,
    ) {
        const members = manager.getRepository(OrganizationMemberEntity);
        let member = await members.findOne({
            where: {
                organizationId: request.organizationId,
                userId: request.userId,
            },
            lock: { mode: 'pessimistic_write' },
        });
        if (member?.status === 'active') return false;
        if (!member) {
            member = members.create({
                organizationId: request.organizationId,
                userId: request.userId,
                role: 'representative',
                status: 'active',
                confirmedAt: new Date(),
            });
        } else {
            member.status = 'active';
            member.confirmedAt = new Date();
            if (member.role !== 'owner') member.role = 'representative';
        }
        await members.save(member);
        return true;
    }

    private presentPublic(request: OrganizationAccessRequestEntity) {
        return {
            id: request.id,
            status: request.status,
            requestedRole: request.requestedRole,
            submittedName: request.submittedName,
            submittedPhone: request.submittedPhone,
            submittedEmail: request.submittedEmail,
            comment: request.comment,
            organization: {
                id: request.organizationId,
                name: request.organization?.name ?? null,
                inn: this.maskInn(request.organization?.inn ?? ''),
            },
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            reviewedAt: request.reviewedAt,
            cancelledAt: request.cancelledAt,
        };
    }

    private presentAdmin(request: OrganizationAccessRequestEntity) {
        return {
            id: request.id,
            status: request.status,
            requestedRole: request.requestedRole,
            submittedName: request.submittedName,
            submittedPhone: request.submittedPhone,
            submittedEmail: request.submittedEmail,
            comment: request.comment,
            reviewComment: request.reviewComment,
            reviewedAt: request.reviewedAt,
            cancelledAt: request.cancelledAt,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            organization: request.organization
                ? {
                      id: request.organization.id,
                      name: request.organization.name,
                      inn: request.organization.inn,
                      kpp: request.organization.kpp,
                  }
                : null,
            customer: request.user
                ? {
                      id: request.user.id,
                      name: request.user.name,
                      username: request.user.username,
                      platform: request.user.platform,
                      chatId: request.user.chatId,
                  }
                : null,
            reviewer: request.reviewedByStaff
                ? {
                      id: request.reviewedByStaff.id,
                      displayName: request.reviewedByStaff.displayName,
                  }
                : null,
        };
    }

    private maskInn(inn: string) {
        if (inn.length < 4) return '****';
        return `${'*'.repeat(inn.length - 4)}${inn.slice(-4)}`;
    }
}
