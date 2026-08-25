import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { getPermissions } from 'src/admin/admin.permissions';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { ServiceRequestEntity } from 'src/service-requests/entities/service-request.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import type { AdminPermission } from 'src/admin/admin.permissions';
import type { OutboundDeliveryEntity } from './entities/outbound-delivery.entity';

export type StaffNotificationKind =
    | 'registrations'
    | 'tickets'
    | 'serviceRequests';

export interface NotificationPreferenceUpdate {
    notifyRegistrations?: boolean;
    notifyTickets?: boolean;
    notifyServiceRequests?: boolean;
}

interface NotificationPolicy {
    sourceType: 'registration' | 'ticket' | 'service_request';
    preference: keyof NotificationPreferenceUpdate;
    readAll: AdminPermission;
    readAssigned?: AdminPermission;
}

interface NotificationSource {
    assignedStaffId: number | null;
}

export interface StaffDeliveryAuthorization {
    authorized: boolean;
    reason?:
        | 'missing_staff_identity'
        | 'unsupported_source'
        | 'source_missing'
        | 'staff_inactive'
        | 'preference_disabled'
        | 'binding_changed'
        | 'permission_revoked';
}

const POLICIES: Record<StaffNotificationKind, NotificationPolicy> = {
    registrations: {
        sourceType: 'registration',
        preference: 'notifyRegistrations',
        readAll: 'registrations.read',
        readAssigned: 'registrations.read.assigned',
    },
    tickets: {
        sourceType: 'ticket',
        preference: 'notifyTickets',
        readAll: 'tickets.read',
    },
    serviceRequests: {
        sourceType: 'service_request',
        preference: 'notifyServiceRequests',
        readAll: 'serviceRequests.read.all',
        readAssigned: 'serviceRequests.read.assigned',
    },
};

@Injectable()
export class StaffNotificationAuthorizationService {
    constructor(
        @InjectRepository(AdminUserEntity)
        private readonly admins: Repository<AdminUserEntity>,
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrations: Repository<RegistrationRequestEntity>,
        @InjectRepository(ServiceRequestEntity)
        private readonly serviceRequests: Repository<ServiceRequestEntity>,
        @InjectRepository(TicketEntity)
        private readonly tickets: Repository<TicketEntity>,
    ) {}

    assertCanEnablePreferences(
        admin: AdminUserEntity,
        input: NotificationPreferenceUpdate,
    ) {
        for (const kind of this.enabledKinds(input)) {
            const preference = POLICIES[kind].preference;
            if (!admin[preference] && !this.canSubscribe(admin, kind)) {
                throw new ForbiddenException(
                    'Notification category is not available for this account',
                );
            }
        }
    }

    async findAuthorizedRecipients(
        kind: StaffNotificationKind,
        context: {
            sourceType: string;
            sourceId: string | number;
            manager?: EntityManager;
        },
    ) {
        const policy = POLICIES[kind];
        if (context.sourceType !== policy.sourceType) {
            throw new Error(
                `Notification kind ${kind} does not match source type ${context.sourceType}`,
            );
        }
        const source = await this.loadSource(
            kind,
            context.sourceId,
            context.manager,
        );
        if (!source) throw new Error('Notification source was not found');

        const repository = context.manager
            ? context.manager.getRepository(AdminUserEntity)
            : this.admins;
        const admins = await repository.find({
            where: { isActive: true },
            relations: { roleAssignments: true },
        });
        return admins.filter(
            (admin) =>
                this.preferenceEnabled(admin, kind) &&
                this.canReadSource(admin, kind, source),
        );
    }

    async authorizeDelivery(
        delivery: OutboundDeliveryEntity,
    ): Promise<StaffDeliveryAuthorization> {
        if (delivery.audience !== 'staff') return { authorized: true };
        if (!delivery.recipientStaffId) {
            return { authorized: false, reason: 'missing_staff_identity' };
        }
        const kind = this.kindForSourceType(delivery.sourceType);
        if (!kind) return { authorized: false, reason: 'unsupported_source' };
        const source = await this.loadSource(kind, delivery.sourceId);
        if (!source) return { authorized: false, reason: 'source_missing' };

        const admin = await this.admins.findOne({
            where: { id: delivery.recipientStaffId },
            relations: { roleAssignments: true },
        });
        if (!admin?.isActive) {
            return { authorized: false, reason: 'staff_inactive' };
        }
        if (!this.preferenceEnabled(admin, kind)) {
            return { authorized: false, reason: 'preference_disabled' };
        }
        const currentChatId =
            delivery.platform === 'telegram'
                ? admin.telegramChatId
                : admin.maxChatId;
        if (currentChatId !== delivery.recipientChatId) {
            return { authorized: false, reason: 'binding_changed' };
        }
        if (!this.canReadSource(admin, kind, source)) {
            return { authorized: false, reason: 'permission_revoked' };
        }
        return { authorized: true };
    }

    private canSubscribe(admin: AdminUserEntity, kind: StaffNotificationKind) {
        const policy = POLICIES[kind];
        const permissions = this.permissions(admin);
        return (
            permissions.has(policy.readAll) ||
            (policy.readAssigned ? permissions.has(policy.readAssigned) : false)
        );
    }

    private canReadSource(
        admin: AdminUserEntity,
        kind: StaffNotificationKind,
        source: NotificationSource,
    ) {
        const policy = POLICIES[kind];
        const permissions = this.permissions(admin);
        if (permissions.has(policy.readAll)) return true;
        return Boolean(
            policy.readAssigned &&
                permissions.has(policy.readAssigned) &&
                source.assignedStaffId === admin.id,
        );
    }

    private permissions(admin: AdminUserEntity) {
        return new Set(
            getPermissions(
                (admin.roleAssignments || []).map(
                    (assignment) => assignment.role,
                ),
            ),
        );
    }

    private preferenceEnabled(
        admin: AdminUserEntity,
        kind: StaffNotificationKind,
    ) {
        return Boolean(admin[POLICIES[kind].preference]);
    }

    private enabledKinds(input: NotificationPreferenceUpdate) {
        return (Object.keys(POLICIES) as StaffNotificationKind[]).filter(
            (kind) => input[POLICIES[kind].preference] === true,
        );
    }

    private kindForSourceType(sourceType: string) {
        return (Object.keys(POLICIES) as StaffNotificationKind[]).find(
            (kind) => POLICIES[kind].sourceType === sourceType,
        );
    }

    private async loadSource(
        kind: StaffNotificationKind,
        sourceId: string | number,
        manager?: EntityManager,
    ): Promise<NotificationSource | null> {
        const id = Number(sourceId);
        if (!Number.isSafeInteger(id) || id <= 0) return null;

        if (kind === 'registrations') {
            const repository = manager
                ? manager.getRepository(RegistrationRequestEntity)
                : this.registrations;
            const source = await repository.findOne({
                where: { id },
                select: { id: true, assignedEngineerId: true },
            });
            return source
                ? { assignedStaffId: source.assignedEngineerId }
                : null;
        }
        if (kind === 'serviceRequests') {
            const repository = manager
                ? manager.getRepository(ServiceRequestEntity)
                : this.serviceRequests;
            const source = await repository.findOne({
                where: { id },
                select: { id: true, assignedEngineerId: true },
            });
            return source
                ? { assignedStaffId: source.assignedEngineerId }
                : null;
        }
        const repository = manager
            ? manager.getRepository(TicketEntity)
            : this.tickets;
        const source = await repository.findOne({
            where: { id },
            select: { id: true },
        });
        return source ? { assignedStaffId: null } : null;
    }
}
