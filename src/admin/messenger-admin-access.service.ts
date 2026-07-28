import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from 'src/audit/audit.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { getPermissions } from './admin.permissions';
import type { AdminPermission } from './admin.permissions';
import { AdminUserEntity } from './entities/admin-user.entity';

type MessengerPlatform = Exclude<UserPlatform, 'web'>;

export interface MessengerCallbackAudit {
    action: string;
    targetType: string;
    targetId?: string | number;
}

@Injectable()
export class MessengerAdminAccessService {
    constructor(
        @InjectRepository(AdminUserEntity)
        private readonly admins: Repository<AdminUserEntity>,
        private readonly auditService: AuditService,
    ) {}

    async authorize(
        platform: MessengerPlatform,
        chatId: string,
        permission: AdminPermission,
        audit: MessengerCallbackAudit,
    ) {
        const admin = await this.findStaff(platform, chatId);
        if (!admin?.isActive || !this.hasPermission(admin, permission)) {
            await this.auditService.record({
                actorType: 'staff',
                actorStaffId: admin?.id,
                action: audit.action,
                targetType: audit.targetType,
                targetId: audit.targetId,
                result: 'denied',
                reason: admin?.isActive
                    ? 'insufficient_permission'
                    : 'inactive_or_unbound_staff',
                metadata: { platform },
            });
            return null;
        }
        return admin;
    }

    async findAuthorizedStaff(
        platform: MessengerPlatform,
        chatId: string,
        permission: AdminPermission,
    ) {
        const admin = await this.findStaff(platform, chatId);
        return admin?.isActive && this.hasPermission(admin, permission)
            ? admin
            : null;
    }

    async findStaff(platform: MessengerPlatform, chatId: string) {
        const matches = await this.admins.find({
            where:
                platform === 'telegram'
                    ? { telegramChatId: chatId }
                    : { maxChatId: chatId },
            relations: { roleAssignments: true },
            take: 2,
        });
        return matches.length === 1 ? matches[0] : null;
    }

    recordSuccess(
        admin: AdminUserEntity,
        platform: MessengerPlatform,
        audit: MessengerCallbackAudit,
    ) {
        return this.auditService.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            action: audit.action,
            targetType: audit.targetType,
            targetId: audit.targetId,
            metadata: { platform },
        });
    }

    recordInvalid(
        admin: AdminUserEntity,
        platform: MessengerPlatform,
        audit: MessengerCallbackAudit,
        reason: string,
    ) {
        return this.auditService.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            action: audit.action,
            targetType: audit.targetType,
            targetId: audit.targetId,
            result: 'denied',
            reason,
            metadata: { platform },
        });
    }

    private hasPermission(admin: AdminUserEntity, permission: AdminPermission) {
        const roles = (admin.roleAssignments || []).map(
            (assignment) => assignment.role,
        );
        return getPermissions(roles).includes(permission);
    }
}
