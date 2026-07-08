import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerMessageOptions, MessengerService } from 'src/messenger/messenger.types';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AdminUserEntity } from './entities/admin-user.entity';

export type AdminNotificationKind = 'registrations' | 'tickets' | 'serviceRequests';

@Injectable()
export class AdminNotificationsService {
    constructor(
        @InjectRepository(AdminUserEntity)
        private readonly adminUsersRepo: Repository<AdminUserEntity>,
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
    ) { }

    async linkChatByCode(code: string, platform: Exclude<UserPlatform, 'web'>, chatId: string) {
        const admin = await this.adminUsersRepo.findOne({
            where: {
                messengerBindCode: code.trim().toUpperCase(),
                messengerBindPlatform: platform,
                messengerBindCodeExpiresAt: MoreThan(new Date()),
                isActive: true,
            },
        });

        if (!admin) {
            return null;
        }

        if (platform === 'telegram') {
            admin.telegramChatId = chatId;
        } else {
            admin.maxChatId = chatId;
        }
        admin.messengerBindCode = null;
        admin.messengerBindPlatform = null;
        admin.messengerBindCodeExpiresAt = null;

        return this.adminUsersRepo.save(admin);
    }

    async notify(kind: AdminNotificationKind, text: string, options?: Omit<MessengerMessageOptions, 'platform'>) {
        const admins = await this.getRecipients(kind);
        await Promise.all(admins.flatMap((admin) => {
            const tasks: Promise<unknown>[] = [];
            if (admin.telegramChatId) {
                tasks.push(this.safeSend(admin, 'telegram', admin.telegramChatId, text, options));
            }
            if (admin.maxChatId) {
                tasks.push(this.safeSend(admin, 'max', admin.maxChatId, text, options));
            }
            return tasks;
        }));
    }

    async notifyDocument(kind: AdminNotificationKind, file: { sourceFactory: () => NodeJS.ReadableStream; filename: string }) {
        const admins = await this.getRecipients(kind);
        await Promise.all(admins.flatMap((admin) => {
            const tasks: Promise<unknown>[] = [];
            if (admin.telegramChatId) {
                tasks.push(this.messengerService.sendDocument(admin.telegramChatId, {
                    source: file.sourceFactory(),
                    filename: file.filename,
                }, { platform: 'telegram' }).catch((error) => {
                    console.error(`Failed to notify admin ${admin.id} in telegram:`, error);
                }));
            }
            if (admin.maxChatId) {
                tasks.push(this.messengerService.sendDocument(admin.maxChatId, {
                    source: file.sourceFactory(),
                    filename: file.filename,
                }, { platform: 'max' }).catch((error) => {
                    console.error(`Failed to notify admin ${admin.id} in max:`, error);
                }));
            }
            return tasks;
        }));
    }

    private getRecipients(kind: AdminNotificationKind) {
        return this.adminUsersRepo.find({
            where: {
                isActive: true,
                ...(kind === 'registrations' ? { notifyRegistrations: true } : {}),
                ...(kind === 'tickets' ? { notifyTickets: true } : {}),
                ...(kind === 'serviceRequests' ? { notifyServiceRequests: true } : {}),
            },
        });
    }

    private safeSend(
        admin: AdminUserEntity,
        platform: Exclude<UserPlatform, 'web'>,
        chatId: string,
        text: string,
        options?: Omit<MessengerMessageOptions, 'platform'>,
    ) {
        return this.messengerService.sendMessage(chatId, text, { ...options, platform }).catch((error) => {
            console.error(`Failed to notify admin ${admin.id} in ${platform}:`, error);
        });
    }
}
