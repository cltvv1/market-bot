import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, type EntityManager, Repository } from 'typeorm';
import type { MessengerMessageOptions } from 'src/messenger/messenger.types';
import { OutboundDeliveriesService } from 'src/outbound-deliveries/outbound-deliveries.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AdminUserEntity } from './entities/admin-user.entity';

export type AdminNotificationKind =
    | 'registrations'
    | 'tickets'
    | 'serviceRequests';

export interface AdminNotificationContext {
    dedupeKey: string;
    sourceType: string;
    sourceId: string | number;
    manager?: EntityManager;
}

@Injectable()
export class AdminNotificationsService {
    constructor(
        @InjectRepository(AdminUserEntity)
        private readonly adminUsersRepo: Repository<AdminUserEntity>,
        private readonly outbound: OutboundDeliveriesService,
    ) {}

    async linkChatByCode(
        code: string,
        platform: Exclude<UserPlatform, 'web'>,
        chatId: string,
    ) {
        const admin = await this.adminUsersRepo.findOne({
            where: {
                messengerBindCode: code.trim().toUpperCase(),
                messengerBindPlatform: platform,
                messengerBindCodeExpiresAt: MoreThan(new Date()),
                isActive: true,
            },
        });

        if (!admin) return null;

        if (platform === 'telegram') admin.telegramChatId = chatId;
        else admin.maxChatId = chatId;
        admin.messengerBindCode = null;
        admin.messengerBindPlatform = null;
        admin.messengerBindCodeExpiresAt = null;
        return this.adminUsersRepo.save(admin);
    }

    async notify(
        kind: AdminNotificationKind,
        text: string,
        context: AdminNotificationContext,
        options?: Omit<MessengerMessageOptions, 'platform'>,
    ) {
        const admins = await this.getRecipients(kind, context.manager);
        await Promise.all(
            admins.flatMap((admin) => {
                const recipients: Array<{
                    platform: 'telegram' | 'max';
                    chatId: string;
                }> = [];
                if (admin.telegramChatId) {
                    recipients.push({
                        platform: 'telegram',
                        chatId: admin.telegramChatId,
                    });
                }
                if (admin.maxChatId) {
                    recipients.push({
                        platform: 'max',
                        chatId: admin.maxChatId,
                    });
                }
                return recipients.map(({ platform, chatId }) =>
                    this.outbound.enqueue(
                        {
                            dedupeKey: `${context.dedupeKey}:staff:${admin.id}:${platform}`,
                            platform,
                            recipientChatId: chatId,
                            kind: 'text',
                            audience: 'staff',
                            sourceType: context.sourceType,
                            sourceId: context.sourceId,
                            payload: { text, ...options },
                        },
                        { manager: context.manager },
                    ),
                );
            }),
        );
    }

    async notifyDocument(
        kind: AdminNotificationKind,
        file: { storedFileId: number; filename: string; caption?: string },
        context: AdminNotificationContext,
    ) {
        const admins = await this.getRecipients(kind, context.manager);
        await Promise.all(
            admins.flatMap((admin) => {
                const recipients: Array<{
                    platform: 'telegram' | 'max';
                    chatId: string;
                }> = [];
                if (admin.telegramChatId) {
                    recipients.push({
                        platform: 'telegram',
                        chatId: admin.telegramChatId,
                    });
                }
                if (admin.maxChatId) {
                    recipients.push({
                        platform: 'max',
                        chatId: admin.maxChatId,
                    });
                }
                return recipients.map(({ platform, chatId }) =>
                    this.outbound.enqueue(
                        {
                            dedupeKey: `${context.dedupeKey}:document:staff:${admin.id}:${platform}`,
                            platform,
                            recipientChatId: chatId,
                            kind: 'document',
                            audience: 'staff',
                            sourceType: context.sourceType,
                            sourceId: context.sourceId,
                            storedFileId: file.storedFileId,
                            payload: {
                                filename: file.filename,
                                caption: file.caption,
                            },
                        },
                        { manager: context.manager },
                    ),
                );
            }),
        );
    }

    private getRecipients(
        kind: AdminNotificationKind,
        manager?: EntityManager,
    ) {
        const repository = manager
            ? manager.getRepository(AdminUserEntity)
            : this.adminUsersRepo;
        return repository.find({
            where: {
                isActive: true,
                ...(kind === 'registrations'
                    ? { notifyRegistrations: true }
                    : {}),
                ...(kind === 'tickets' ? { notifyTickets: true } : {}),
                ...(kind === 'serviceRequests'
                    ? { notifyServiceRequests: true }
                    : {}),
            },
        });
    }
}
