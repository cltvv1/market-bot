import * as fs from 'fs';
import { Readable } from 'node:stream';
import { randomBytes } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, In } from 'typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import type {
    RegistrationRequestPriority,
    RegistrationRequestStatus,
} from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { TicketMessageEntity } from 'src/tickets/entities/ticket-message.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { EquipmentKitEntity } from 'src/assets/entities/equipment-kit.entity';
import { CustomerActivityEntity } from 'src/customer-activity/entities/customer-activity.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import { CanonicalServiceRequestsService } from 'src/service-requests/canonical-service-requests.service';
import { ServiceRequestEntity } from 'src/service-requests/entities/service-request.entity';
import type {
    ServiceRequestPriority,
    ServiceRequestStatus,
} from 'src/service-requests/entities/service-request.entity';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { TicketMessageType } from 'src/tickets/entities/ticket-message.entity';
import { AdminUserEntity } from './entities/admin-user.entity';
import type { AdminPrincipal } from './admin-auth.types';
import { FilesService } from 'src/files/files.service';
// prettier-ignore
import { OrganizationContactEntity } from 'src/integrations/entities/organization-contact.entity';

export type AdminStatusFilter = 'all' | 'new' | 'in_work' | 'processed';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationsRepo: Repository<RegistrationRequestEntity>,
        @InjectRepository(TicketEntity)
        private readonly ticketsRepo: Repository<TicketEntity>,
        @InjectRepository(TicketMessageEntity)
        private readonly ticketMessagesRepo: Repository<TicketMessageEntity>,
        @InjectRepository(OrganizationEntity)
        private readonly organizationsRepo: Repository<OrganizationEntity>,
        @InjectRepository(OrganizationMemberEntity)
        private readonly organizationMembersRepo: Repository<OrganizationMemberEntity>,
        @InjectRepository(CashRegisterEntity)
        private readonly cashRegistersRepo: Repository<CashRegisterEntity>,
        @InjectRepository(FiscalDriveEntity)
        private readonly fiscalDrivesRepo: Repository<FiscalDriveEntity>,
        @InjectRepository(OfdSubscriptionEntity)
        private readonly ofdSubscriptionsRepo: Repository<OfdSubscriptionEntity>,
        @InjectRepository(EquipmentKitEntity)
        private readonly equipmentKitsRepo: Repository<EquipmentKitEntity>,
        @InjectRepository(CustomerActivityEntity)
        private readonly activitiesRepo: Repository<CustomerActivityEntity>,
        @InjectRepository(UserEntity)
        private readonly usersRepo: Repository<UserEntity>,
        @InjectRepository(ServiceRequestEntity)
        private readonly serviceRequestsRepo: Repository<ServiceRequestEntity>,
        @InjectRepository(AdminUserEntity)
        private readonly adminUsersRepo: Repository<AdminUserEntity>,
        @InjectRepository(OrganizationContactEntity)
        private readonly organizationContactsRepo: Repository<OrganizationContactEntity>,
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly canonicalServiceRequests: CanonicalServiceRequestsService,
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
        private readonly filesService: FilesService,
    ) {}

    async getNotificationBindings(adminId: number) {
        const admin = await this.adminUsersRepo.findOne({
            where: { id: adminId },
        });
        if (!admin) return null;

        return {
            telegramChatId: admin.telegramChatId,
            maxChatId: admin.maxChatId,
            notifyRegistrations: admin.notifyRegistrations,
            notifyTickets: admin.notifyTickets,
            notifyServiceRequests: admin.notifyServiceRequests,
            pendingBindPlatform: admin.messengerBindPlatform,
            pendingBindCode: admin.messengerBindCode,
            pendingBindCodeExpiresAt: admin.messengerBindCodeExpiresAt,
        };
    }

    async createMessengerBindCode(
        adminId: number,
        platform: 'telegram' | 'max',
    ) {
        const admin = await this.adminUsersRepo.findOne({
            where: { id: adminId, isActive: true },
        });
        if (!admin) return null;

        admin.messengerBindCode = randomBytes(4).toString('hex').toUpperCase();
        admin.messengerBindPlatform = platform;
        admin.messengerBindCodeExpiresAt = new Date(
            Date.now() + 15 * 60 * 1000,
        );
        await this.adminUsersRepo.save(admin);

        return {
            platform,
            code: admin.messengerBindCode,
            expiresAt: admin.messengerBindCodeExpiresAt,
            command: `/admin ${admin.messengerBindCode}`,
        };
    }

    async updateNotificationSettings(
        adminId: number,
        input: {
            notifyRegistrations?: boolean;
            notifyTickets?: boolean;
            notifyServiceRequests?: boolean;
        },
    ) {
        const admin = await this.adminUsersRepo.findOne({
            where: { id: adminId, isActive: true },
        });
        if (!admin) return null;

        if (input.notifyRegistrations !== undefined) {
            admin.notifyRegistrations = input.notifyRegistrations;
        }
        if (input.notifyTickets !== undefined) {
            admin.notifyTickets = input.notifyTickets;
        }
        if (input.notifyServiceRequests !== undefined) {
            admin.notifyServiceRequests = input.notifyServiceRequests;
        }

        await this.adminUsersRepo.save(admin);
        return this.getNotificationBindings(admin.id);
    }

    async getSummary(admin: AdminPrincipal) {
        const permissions = new Set(admin.permissions);
        const [newRegistrations, openTickets, activeServiceRequests] =
            await Promise.all([
                permissions.has('registrations.read')
                    ? this.registrationsRepo.count({
                          where: { isFilled: true, isProcessed: false },
                      })
                    : 0,
                permissions.has('tickets.read')
                    ? this.ticketsRepo.count({ where: { isAnswered: false } })
                    : 0,
                permissions.has('serviceRequests.read.all')
                    ? this.serviceRequestsService
                          .listForAdmin('active')
                          .then((items) => items.length)
                    : permissions.has('serviceRequests.read.assigned')
                      ? this.serviceRequestsService
                            .listForAdmin('active', undefined, admin.id)
                            .then((items) => items.length)
                      : 0,
            ]);

        return { newRegistrations, openTickets, activeServiceRequests };
    }

    getRegistrations(
        status: AdminStatusFilter = 'new',
        platform?: UserPlatform,
        priority?: RegistrationRequestPriority,
    ) {
        const commonWhere = {
            ...(platform ? { platform } : {}),
            ...(priority ? { priority } : {}),
        };
        const where =
            status === 'all'
                ? commonWhere
                : status === 'processed'
                  ? [
                        {
                            ...commonWhere,
                            status: 'processed' as RegistrationRequestStatus,
                        },
                        { ...commonWhere, isProcessed: true },
                    ]
                  : {
                        ...commonWhere,
                        status,
                        isFilled: true,
                        isProcessed: false,
                    };

        return this.registrationsRepo.find({
            where,
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    getRegistrationsForAdmin(
        admin: AdminPrincipal,
        status: AdminStatusFilter = 'new',
        platform?: UserPlatform,
        priority?: RegistrationRequestPriority,
    ) {
        if (admin.permissions.includes('registrations.read'))
            return this.getRegistrations(status, platform, priority);
        if (!admin.permissions.includes('registrations.read.assigned'))
            return [];
        const commonWhere = {
            assignedEngineerId: admin.id,
            ...(platform ? { platform } : {}),
            ...(priority ? { priority } : {}),
        };
        const where =
            status === 'all'
                ? commonWhere
                : status === 'processed'
                  ? {
                        ...commonWhere,
                        status: 'processed' as RegistrationRequestStatus,
                    }
                  : { ...commonWhere, status, isFilled: true };
        return this.registrationsRepo.find({
            where,
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    async getRegistrationForAdmin(admin: AdminPrincipal, id: number) {
        if (admin.permissions.includes('registrations.read'))
            return this.getRegistration(id);
        if (!admin.permissions.includes('registrations.read.assigned'))
            return null;
        return this.registrationsRepo.findOne({
            where: { id, assignedEngineerId: admin.id },
        });
    }

    getRegistration(id: number) {
        return this.registrationsRepo.findOne({ where: { id } });
    }

    getTickets(status: AdminStatusFilter = 'new', platform?: UserPlatform) {
        return this.ticketsRepo.find({
            where: {
                ...(status === 'new' ? { isAnswered: false } : {}),
                ...(status === 'processed' ? { isAnswered: true } : {}),
                ...(platform ? { platform } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    getServiceRequests(
        status: ServiceRequestStatus | 'active' | 'all' = 'active',
        platform?: UserPlatform,
    ) {
        return this.serviceRequestsService.listForAdmin(status, platform);
    }

    getServiceRequestsForAdmin(
        admin: AdminPrincipal,
        status: ServiceRequestStatus | 'active' | 'all' = 'active',
        platform?: UserPlatform,
    ) {
        const assignedEngineerId = admin.permissions.includes(
            'serviceRequests.read.all',
        )
            ? undefined
            : admin.id;
        return this.serviceRequestsService.listForAdmin(
            status,
            platform,
            assignedEngineerId,
        );
    }

    getServiceRequest(id: number) {
        return this.serviceRequestsService.getRequestDetails(id);
    }

    async getServiceRequestDetailsForAdmin(admin: AdminPrincipal, id: number) {
        if (!admin.permissions.includes('serviceRequests.read.all')) {
            const request = await this.serviceRequestsRepo.findOne({
                where: { id, assignedEngineerId: admin.id },
            });
            if (!request) {
                throw new BadRequestException(
                    'Service request was not found for this staff member',
                );
            }
        }
        const [legacy, canonical] = await Promise.all([
            this.serviceRequestsService.getRequestDetails(id),
            this.canonicalServiceRequests.getAdminDetails(id),
        ]);
        return {
            ...legacy,
            messages: canonical.messages,
            attachments: canonical.attachments,
        };
    }

    async assignEngineer(
        id: number,
        assignedEngineerId: number,
        operatorId: string,
    ) {
        const engineer = await this.adminUsersRepo
            .createQueryBuilder('user')
            .innerJoinAndSelect('user.roleAssignments', 'assignment')
            .where('user.id = :assignedEngineerId', { assignedEngineerId })
            .andWhere('user.isActive = true')
            .andWhere('assignment.role = :role', { role: 'engineer' })
            .getOne();
        if (!engineer) {
            throw new BadRequestException(
                'Active engineer staff account was not found',
            );
        }

        const request = await this.serviceRequestsRepo.findOne({
            where: { id },
        });
        if (!request) {
            throw new BadRequestException('Service request was not found');
        }
        request.assignedEngineerId = engineer.id;
        request.executorName = engineer.displayName;
        await this.serviceRequestsRepo.save(request);
        return this.serviceRequestsService.updateOperatorState(
            id,
            { executorName: engineer.displayName },
            operatorId,
        );
    }

    attachServiceRequestInvoice(
        id: number,
        invoiceFileId: string,
        invoiceFileName?: string,
        operatorId = 'admin-panel',
        invoiceStoredFileId?: number,
    ) {
        return this.serviceRequestsService.attachInvoice(
            id,
            invoiceFileId,
            invoiceFileName,
            operatorId,
            invoiceStoredFileId,
        );
    }

    markServiceRequestPaymentReceived(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.markPaymentReceived(id, operatorId);
    }

    scheduleServiceRequestVisit(
        id: number,
        visitAddress: string,
        visitTime?: string,
        operatorComment?: string,
        operatorId = 'admin-panel',
    ) {
        return this.serviceRequestsService.scheduleVisit(
            id,
            visitAddress,
            visitTime,
            operatorComment,
            operatorId,
        );
    }

    completeServiceRequest(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.complete(id, operatorId);
    }

    cancelServiceRequest(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.cancel(id, operatorId);
    }

    updateServiceRequestOperatorState(
        id: number,
        input: {
            priority?: ServiceRequestPriority;
            executorName?: string | null;
            operatorComment?: string | null;
        },
        operatorId = 'admin-panel',
    ) {
        return this.serviceRequestsService.updateOperatorState(
            id,
            input,
            operatorId,
        );
    }

    getActivities(userId?: number, organizationId?: number) {
        return this.activitiesRepo.find({
            where: {
                ...(userId ? { userId } : {}),
                ...(organizationId ? { organizationId } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    async getCustomerContext(input: {
        userId?: number;
        organizationId?: number;
        platform?: UserPlatform;
        chatId?: string;
    }) {
        const user = await this.findContextUser(input);
        // prettier-ignore
        const [organization, memberships, assets, activities, contacts] = await Promise.all([
            input.organizationId ? this.organizationsRepo.findOne({ where: { id: input.organizationId } }) : Promise.resolve(null),
            user ? this.organizationMembersRepo.find({
                where: { userId: user.id, status: 'active' },
                relations: { organization: true },
                order: { id: 'ASC' },
            }) : Promise.resolve([]),
            input.organizationId ? this.getOrganizationAssets(input.organizationId) : Promise.resolve({ cashRegisters: [], fiscalDrives: [], ofdSubscriptions: [] }),
            this.activitiesRepo.find({
                where: this.buildActivityContextWhere(input),
                order: { createdAt: 'DESC' },
                take: 8,
            }),
            input.organizationId ? this.organizationContactsRepo.find({
                where: { organizationId: input.organizationId, isActive: true },
                order: { kind: 'ASC', id: 'ASC' },
            }) : Promise.resolve([]),
        ]);

        return {
            user,
            organization,
            organizations: memberships.map((member) => ({
                id: member.organizationId,
                role: member.role,
                status: member.status,
                organization: member.organization,
            })),
            assets,
            activities,
            contacts,
        };
    }

    async getCustomerCard(input: {
        userId?: number;
        organizationId?: number;
        platform?: UserPlatform;
        chatId?: string;
    }) {
        const context = await this.getCustomerContext(input);
        const user = context.user;
        const relationWhere = this.buildCustomerRelationWhere({
            userId: input.userId || user?.id,
            platform: input.platform || user?.platform,
            chatId: input.chatId || user?.chatId,
        });

        const [registrations, serviceRequests, tickets] = await Promise.all([
            relationWhere.length
                ? this.registrationsRepo.find({
                      where: relationWhere,
                      order: { createdAt: 'DESC' },
                      take: 50,
                  })
                : Promise.resolve([]),
            relationWhere.length
                ? this.serviceRequestsRepo.find({
                      where: relationWhere,
                      order: { createdAt: 'DESC' },
                      take: 50,
                  })
                : Promise.resolve([]),
            relationWhere.length
                ? this.ticketsRepo.find({
                      where: relationWhere.map((where) => ({
                          ...(where.userId ? { userId: where.userId } : {}),
                          ...(where.platform
                              ? { platform: where.platform }
                              : {}),
                          ...(where.chatId ? { userChatId: where.chatId } : {}),
                      })),
                      order: { createdAt: 'DESC' },
                      take: 50,
                  })
                : Promise.resolve([]),
        ]);

        return {
            ...context,
            registrations,
            serviceRequests,
            tickets: tickets.filter((ticket) => ticket.text?.trim()),
        };
    }

    async getOrganizations() {
        const organizations = await this.organizationsRepo.find({
            order: { createdAt: 'DESC' },
            take: 100,
        });

        const members = await this.organizationMembersRepo.find({
            relations: { user: true },
            order: { id: 'ASC' },
        });

        return organizations.map((organization) => ({
            ...organization,
            members: members.filter(
                (member) => member.organizationId === organization.id,
            ),
        }));
    }

    getEquipmentKits(query?: string) {
        return this.equipmentKitsRepo
            .find({
                order: { createdAt: 'DESC' },
                take: 200,
            })
            .then((items) => {
                const normalized = query?.trim().toLowerCase();
                if (!normalized) return items;
                return items.filter((item) =>
                    [
                        item.cashRegisterModel,
                        item.cashRegisterSerial,
                        item.fiscalDriveSerial,
                        item.ofdActivationCode,
                        item.marketplaceOrderId,
                    ]
                        .filter(Boolean)
                        .some((value) =>
                            String(value).toLowerCase().includes(normalized),
                        ),
                );
            });
    }

    getFreeEquipmentKits(query?: string) {
        return this.equipmentKitsRepo
            .find({
                where: {
                    registrationRequestId: IsNull(),
                    status: Not(In(['linked', 'registered', 'archived'])),
                },
                order: { createdAt: 'DESC' },
                take: 200,
            })
            .then((items) => {
                const normalized = query?.trim().toLowerCase();
                if (!normalized) return items;
                return items.filter((item) =>
                    [
                        item.cashRegisterModel,
                        item.cashRegisterSerial,
                        item.fiscalDriveSerial,
                        item.ofdActivationCode,
                        item.marketplaceOrderId,
                    ]
                        .filter(Boolean)
                        .some((value) =>
                            String(value).toLowerCase().includes(normalized),
                        ),
                );
            });
    }

    createEquipmentKit(input: Partial<EquipmentKitEntity>) {
        const kit = this.equipmentKitsRepo.create({
            cashRegisterModel: input.cashRegisterModel?.trim() || null,
            cashRegisterSerial: input.cashRegisterSerial?.trim() || null,
            fiscalDriveSerial: input.fiscalDriveSerial?.trim() || null,
            ofdActivationCode: input.ofdActivationCode?.trim() || null,
            marketplaceOrderId: input.marketplaceOrderId?.trim() || null,
            comment: input.comment?.trim() || null,
            status: input.status || 'stock',
        });
        return this.equipmentKitsRepo.save(kit);
    }

    async linkEquipmentKitToRegistration(
        registrationId: number,
        kitId: number,
    ) {
        const [registration, kit] = await Promise.all([
            this.registrationsRepo.findOne({ where: { id: registrationId } }),
            this.equipmentKitsRepo.findOne({ where: { id: kitId } }),
        ]);
        if (!registration || !kit) return null;

        registration.equipmentKitId = kit.id;
        kit.registrationRequestId = registration.id;
        kit.status = 'linked';
        await Promise.all([
            this.registrationsRepo.save(registration),
            this.equipmentKitsRepo.save(kit),
        ]);

        return { registration, kit };
    }

    async getOrganizationAssets(organizationId: number) {
        const [cashRegisters, fiscalDrives, ofdSubscriptions] =
            await Promise.all([
                this.cashRegistersRepo.find({
                    where: { organizationId },
                    order: { id: 'ASC' },
                }),
                this.fiscalDrivesRepo.find({
                    where: { organizationId },
                    order: { id: 'ASC' },
                }),
                this.ofdSubscriptionsRepo.find({
                    where: { organizationId },
                    order: { id: 'ASC' },
                }),
            ]);

        return { cashRegisters, fiscalDrives, ofdSubscriptions };
    }

    async getTicket(id: number) {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        let messages = await this.getTicketMessages(id);

        if (ticket?.text && messages.length === 0) {
            await this.ticketMessagesRepo.save(
                this.ticketMessagesRepo.create({
                    ticketId: id,
                    sender: 'user',
                    authorId: ticket.userChatId,
                    source: 'bot',
                    text: ticket.text,
                }),
            );
            messages = await this.getTicketMessages(id);
        }

        const context = ticket
            ? await this.getCustomerContext({
                  userId: ticket.userId,
                  organizationId: ticket.organizationId,
                  platform: ticket.platform,
                  chatId: ticket.userChatId,
              })
            : null;

        return { ticket, messages, context };
    }

    async getServiceRequestDetails(id: number) {
        const details = await this.serviceRequestsService.getRequestDetails(id);
        const context = details?.request
            ? await this.getCustomerContext({
                  userId: details.request.userId,
                  organizationId: details.request.organizationId,
                  platform: details.request.platform,
                  chatId: details.request.chatId,
              })
            : null;

        return { ...details, context };
    }

    getTicketMessages(ticketId: number) {
        return this.ticketMessagesRepo.find({
            where: { ticketId },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
    }

    getTicketMessage(id: number) {
        return this.ticketMessagesRepo.findOne({ where: { id } });
    }

    async processRegistration(id: number) {
        await this.registrationsRepo.update(id, {
            isProcessed: true,
            status: 'processed',
        });
        return this.registrationsRepo.findOne({ where: { id } });
    }

    async updateRegistrationOperatorState(
        id: number,
        input: {
            status?: RegistrationRequestStatus;
            priority?: RegistrationRequestPriority;
        },
    ) {
        const patch: {
            status?: RegistrationRequestStatus;
            isProcessed?: boolean;
            priority?: RegistrationRequestPriority;
        } = {};
        if (input.status) {
            if (input.status === 'processed') {
                throw new BadRequestException(
                    'Use registration handoff to complete processing',
                );
            }
            patch.status = input.status;
            patch.isProcessed = false;
        }
        if (input.priority) {
            patch.priority = input.priority;
        }

        if (!Object.keys(patch).length) {
            return this.registrationsRepo.findOne({ where: { id } });
        }

        await this.registrationsRepo.update(id, patch);
        return this.registrationsRepo.findOne({ where: { id } });
    }

    async sendTicketMessage(
        id: number,
        text: string,
        operatorId = 'admin-panel',
    ) {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        if (!ticket) {
            return null;
        }

        if (ticket.platform !== 'web') {
            await this.messengerService.sendMessage(ticket.userChatId, text, {
                platform: ticket.platform,
            });
        }

        await this.ticketMessagesRepo.save(
            this.ticketMessagesRepo.create({
                ticketId: id,
                sender: 'operator',
                authorId: operatorId,
                source: 'admin-panel',
                text,
            }),
        );

        return this.getTicket(id);
    }

    async sendTicketMedia(
        id: number,
        media: {
            messageType: Exclude<TicketMessageType, 'text'>;
            localPath?: string;
            buffer?: Buffer;
            fileName: string;
            mimeType?: string;
            fileSize?: number;
            text?: string;
        },
        operatorId = 'admin-panel',
    ) {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        if (!ticket) {
            return null;
        }
        if (!media.buffer && !media.localPath) {
            throw new BadRequestException('Ticket media content is required');
        }
        const storedFile = media.buffer
            ? await this.filesService.saveBuffer({
                  purpose:
                      media.messageType === 'image'
                          ? 'ticket-image'
                          : media.messageType === 'video' ||
                              media.messageType === 'video_note'
                            ? 'ticket-video'
                            : media.messageType === 'audio' ||
                                media.messageType === 'voice'
                              ? 'ticket-audio'
                              : 'ticket-document',
                  buffer: media.buffer,
                  originalName: media.fileName,
                  mimeType: media.mimeType,
              })
            : null;

        if (ticket.platform !== 'web') {
            const file = {
                source: media.buffer
                    ? Readable.from(media.buffer)
                    : fs.createReadStream(media.localPath!),
                filename: media.fileName,
            };
            const options = {
                platform: ticket.platform,
                caption: media.text || undefined,
            };

            if (media.messageType === 'image') {
                await this.messengerService.sendImage(
                    ticket.userChatId,
                    file,
                    options,
                );
            } else {
                await this.messengerService.sendDocument(
                    ticket.userChatId,
                    file,
                    options,
                );
            }
        }

        await this.ticketMessagesRepo.save(
            this.ticketMessagesRepo.create({
                ticketId: id,
                sender: 'operator',
                authorId: operatorId,
                source: 'admin-panel',
                messageType: media.messageType,
                text: media.text || media.fileName,
                fileName: media.fileName,
                mimeType: media.mimeType ?? null,
                fileSize: media.fileSize,
                localPath: media.localPath ?? null,
                storedFileId: storedFile?.id ?? null,
            }),
        );

        return this.getTicket(id);
    }

    async closeTicket(id: number, operatorId = 'admin-panel') {
        await this.ticketsRepo.update(id, {
            isAnswered: true,
            answeredBy: operatorId,
        });

        return this.getTicket(id);
    }

    async replyToTicket(id: number, text: string, operatorId = 'admin-panel') {
        const result = await this.sendTicketMessage(id, text, operatorId);
        if (!result?.ticket) {
            return null;
        }

        return this.closeTicket(id, operatorId);
    }

    private async findContextUser(input: {
        userId?: number;
        platform?: UserPlatform;
        chatId?: string;
    }) {
        if (input.userId) {
            const user = await this.usersRepo.findOne({
                where: { id: input.userId },
            });
            if (user) return user;
        }

        if (input.platform && input.chatId) {
            return this.usersRepo.findOne({
                where: { platform: input.platform, chatId: input.chatId },
            });
        }

        return null;
    }

    private buildActivityContextWhere(input: {
        userId?: number;
        organizationId?: number;
    }) {
        const where = [
            ...(input.userId ? [{ userId: input.userId }] : []),
            ...(input.organizationId
                ? [{ organizationId: input.organizationId }]
                : []),
        ];

        return where.length ? where : { id: -1 };
    }

    private buildCustomerRelationWhere(input: {
        userId?: number;
        platform?: UserPlatform;
        chatId?: string;
    }) {
        return [
            ...(input.userId ? [{ userId: input.userId }] : []),
            ...(input.platform && input.chatId
                ? [{ platform: input.platform, chatId: input.chatId }]
                : []),
        ];
    }
}
