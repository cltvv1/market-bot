import * as fs from 'fs';
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan } from 'typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { TicketMessageEntity } from 'src/tickets/entities/ticket-message.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { CustomerActivityEntity } from 'src/customer-activity/entities/customer-activity.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import type { ServiceRequestPriority, ServiceRequestStatus } from 'src/service-requests/entities/service-request.entity';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { TicketMessageType } from 'src/tickets/entities/ticket-message.entity';
import { AdminSessionEntity } from './entities/admin-session.entity';
import { AdminUserEntity } from './entities/admin-user.entity';

export type AdminStatusFilter = 'all' | 'new' | 'processed';

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
        @InjectRepository(CustomerActivityEntity)
        private readonly activitiesRepo: Repository<CustomerActivityEntity>,
        @InjectRepository(UserEntity)
        private readonly usersRepo: Repository<UserEntity>,
        @InjectRepository(AdminUserEntity)
        private readonly adminUsersRepo: Repository<AdminUserEntity>,
        @InjectRepository(AdminSessionEntity)
        private readonly adminSessionsRepo: Repository<AdminSessionEntity>,
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly configService: ConfigService,
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
    ) { }

    async loginAdmin(login: string, password: string) {
        await this.ensureDefaultAdmin();
        const admin = await this.adminUsersRepo.findOne({ where: { login: login.trim().toLowerCase(), isActive: true } });
        if (!admin || !this.verifyPassword(password, admin.passwordHash)) {
            return null;
        }

        const token = randomBytes(32).toString('base64url');
        const days = this.configService.get<number>('ADMIN_SESSION_DAYS') || 180;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await this.adminSessionsRepo.save(this.adminSessionsRepo.create({
            tokenHash: this.hashSessionToken(token),
            userId: admin.id,
            expiresAt,
        }));

        return {
            token,
            expiresAt,
            admin: this.presentAdmin(admin),
        };
    }

    async getAdminBySessionToken(token?: string | null) {
        if (!token) return null;
        const session = await this.adminSessionsRepo.findOne({
            where: { tokenHash: this.hashSessionToken(token), expiresAt: MoreThan(new Date()) },
            relations: { user: true },
        });

        if (!session?.user?.isActive) {
            return null;
        }

        return this.presentAdmin(session.user);
    }

    async logoutAdmin(token?: string | null) {
        if (!token) return;
        await this.adminSessionsRepo.delete({ tokenHash: this.hashSessionToken(token) });
    }

    private async ensureDefaultAdmin() {
        const count = await this.adminUsersRepo.count();
        if (count > 0) return;

        const login = (this.configService.get<string>('ADMIN_LOGIN') || 'admin').trim().toLowerCase();
        const password = this.configService.get<string>('ADMIN_PASSWORD') || this.configService.get<string>('ADMIN_TOKEN') || 'admin';
        const displayName = this.configService.get<string>('ADMIN_NAME') || login;
        await this.adminUsersRepo.save(this.adminUsersRepo.create({
            login,
            displayName,
            role: 'admin',
            passwordHash: this.hashPassword(password),
            isActive: true,
        }));
    }

    private presentAdmin(admin: AdminUserEntity) {
        return {
            id: admin.id,
            login: admin.login,
            displayName: admin.displayName,
            role: admin.role,
        };
    }

    private hashPassword(password: string) {
        const salt = randomBytes(16).toString('base64url');
        const iterations = 120000;
        const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
        return `pbkdf2$${iterations}$${salt}$${hash}`;
    }

    private verifyPassword(password: string, storedHash: string) {
        const [method, iterationsText, salt, expectedHash] = storedHash.split('$');
        if (method !== 'pbkdf2' || !iterationsText || !salt || !expectedHash) return false;
        const actual = pbkdf2Sync(password, salt, Number(iterationsText), 32, 'sha256');
        const expected = Buffer.from(expectedHash, 'base64url');
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    }

    private hashSessionToken(token: string) {
        return createHash('sha256').update(token).digest('base64url');
    }

    async getSummary() {
        const [newRegistrations, openTickets, activeServiceRequests] = await Promise.all([
            this.registrationsRepo.count({ where: { isFilled: true, isProcessed: false } }),
            this.ticketsRepo.count({ where: { isAnswered: false } }),
            this.serviceRequestsService.listForAdmin('active').then((items) => items.length),
        ]);

        return { newRegistrations, openTickets, activeServiceRequests };
    }

    getRegistrations(status: AdminStatusFilter = 'new', platform?: UserPlatform) {
        return this.registrationsRepo.find({
            where: {
                ...(status === 'new' ? { isFilled: true, isProcessed: false } : {}),
                ...(status === 'processed' ? { isProcessed: true } : {}),
                ...(platform ? { platform } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
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

    getServiceRequests(status: ServiceRequestStatus | 'active' | 'all' = 'active', platform?: UserPlatform) {
        return this.serviceRequestsService.listForAdmin(status, platform);
    }

    getServiceRequest(id: number) {
        return this.serviceRequestsService.getRequestDetails(id);
    }

    attachServiceRequestInvoice(id: number, invoiceFileId: string, invoiceFileName?: string, operatorId = 'admin-panel') {
        return this.serviceRequestsService.attachInvoice(id, invoiceFileId, invoiceFileName, operatorId);
    }

    markServiceRequestPaymentReceived(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.markPaymentReceived(id, operatorId);
    }

    scheduleServiceRequestVisit(id: number, visitAddress: string, visitTime?: string, operatorComment?: string, operatorId = 'admin-panel') {
        return this.serviceRequestsService.scheduleVisit(id, visitAddress, visitTime, operatorComment, operatorId);
    }

    completeServiceRequest(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.complete(id, operatorId);
    }

    cancelServiceRequest(id: number, operatorId = 'admin-panel') {
        return this.serviceRequestsService.cancel(id, operatorId);
    }

    updateServiceRequestOperatorState(
        id: number,
        input: { priority?: ServiceRequestPriority; executorName?: string | null; operatorComment?: string | null },
        operatorId = 'admin-panel',
    ) {
        return this.serviceRequestsService.updateOperatorState(id, input, operatorId);
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

    async getCustomerContext(input: { userId?: number; organizationId?: number; platform?: UserPlatform; chatId?: string }) {
        const user = await this.findContextUser(input);
        const [organization, memberships, assets, activities] = await Promise.all([
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
            members: members.filter((member) => member.organizationId === organization.id),
        }));
    }

    async getOrganizationAssets(organizationId: number) {
        const [cashRegisters, fiscalDrives, ofdSubscriptions] = await Promise.all([
            this.cashRegistersRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
            this.fiscalDrivesRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
            this.ofdSubscriptionsRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
        ]);

        return { cashRegisters, fiscalDrives, ofdSubscriptions };
    }

    async getTicket(id: number) {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        let messages = await this.getTicketMessages(id);

        if (ticket?.text && messages.length === 0) {
            await this.ticketMessagesRepo.save(this.ticketMessagesRepo.create({
                ticketId: id,
                sender: 'user',
                authorId: ticket.userChatId,
                source: 'bot',
                text: ticket.text,
            }));
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
        await this.registrationsRepo.update(id, { isProcessed: true });
        return this.registrationsRepo.findOne({ where: { id } });
    }

    async sendTicketMessage(id: number, text: string, operatorId = 'admin-panel') {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        if (!ticket) {
            return null;
        }

        if (ticket.platform !== 'web') {
            await this.messengerService.sendMessage(ticket.userChatId, text, {
                platform: ticket.platform,
            });
        }

        await this.ticketMessagesRepo.save(this.ticketMessagesRepo.create({
            ticketId: id,
            sender: 'operator',
            authorId: operatorId,
            source: 'admin-panel',
            text,
        }));

        return this.getTicket(id);
    }

    async sendTicketMedia(
        id: number,
        media: {
            messageType: Exclude<TicketMessageType, 'text'>;
            localPath: string;
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

        if (ticket.platform !== 'web') {
            const file = {
                source: fs.createReadStream(media.localPath),
                filename: media.fileName,
            };
            const options = {
                platform: ticket.platform,
                caption: media.text || undefined,
            };

            if (media.messageType === 'image') {
                await this.messengerService.sendImage(ticket.userChatId, file, options);
            } else {
                await this.messengerService.sendDocument(ticket.userChatId, file, options);
            }
        }

        await this.ticketMessagesRepo.save(this.ticketMessagesRepo.create({
            ticketId: id,
            sender: 'operator',
            authorId: operatorId,
            source: 'admin-panel',
            messageType: media.messageType,
            text: media.text || media.fileName,
            fileName: media.fileName,
            mimeType: media.mimeType ?? null,
            fileSize: media.fileSize,
            localPath: media.localPath,
        }));

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

    private async findContextUser(input: { userId?: number; platform?: UserPlatform; chatId?: string }) {
        if (input.userId) {
            const user = await this.usersRepo.findOne({ where: { id: input.userId } });
            if (user) return user;
        }

        if (input.platform && input.chatId) {
            return this.usersRepo.findOne({ where: { platform: input.platform, chatId: input.chatId } });
        }

        return null;
    }

    private buildActivityContextWhere(input: { userId?: number; organizationId?: number }) {
        const where = [
            ...(input.userId ? [{ userId: input.userId }] : []),
            ...(input.organizationId ? [{ organizationId: input.organizationId }] : []),
        ];

        return where.length ? where : { id: -1 };
    }
}
