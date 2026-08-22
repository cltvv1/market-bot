import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity, UserPlatform } from './entities/user.entity';
import { UserChannelEntity } from './entities/user-channel.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepo: Repository<UserEntity>,
        @InjectRepository(UserChannelEntity)
        private readonly channelsRepo: Repository<UserChannelEntity>,
    ) {}

    async getOrCreateOrUpdate(
        chatId: string,
        name?: string,
        username?: string,
        platform: UserPlatform = 'telegram',
    ) {
        let user = await this.usersRepo.findOne({
            where: { chatId, platform },
        });

        const now = new Date();

        if (!user) {
            user = this.usersRepo.create({
                chatId,
                platform,
                name,
                username,
                firstSeenAt: now,
            });
            await this.usersRepo.save(user);
        }

        let needUpdate = false;

        if (user.platform !== platform) {
            user.platform = platform;
            needUpdate = true;
        }

        if (name && user.name !== name) {
            user.name = name;
            needUpdate = true;
        }

        if (username && user.username !== username) {
            user.username = username;
            needUpdate = true;
        }

        user.lastSeenAt = now;
        needUpdate = true;

        if (needUpdate) {
            await this.usersRepo.save(user);
        }

        await this.upsertChannel(user, chatId, platform, name, username, now);

        return user;
    }

    async getChannel(externalId: string, platform: UserPlatform = 'telegram') {
        return this.channelsRepo.findOne({
            where: { externalId, platform },
            relations: { user: true },
        });
    }

    async getUserIdByChannel(
        externalId: string,
        platform: UserPlatform = 'telegram',
    ) {
        const channel = await this.getChannel(externalId, platform);
        return channel?.userId ?? null;
    }

    async getByChatId(chatId: string, platform: UserPlatform = 'telegram') {
        return this.usersRepo.findOne({ where: { chatId, platform } });
    }

    async update(
        chatId: string,
        partial: Partial<UserEntity>,
        platform: UserPlatform = 'telegram',
    ) {
        await this.usersRepo.update({ chatId, platform }, partial);
        return this.getByChatId(chatId, platform);
    }

    async setTalkingTo(
        operatorChatId: string,
        clientChatId: string,
        platform: UserPlatform = 'telegram',
    ) {
        await this.usersRepo.update(
            { chatId: operatorChatId, platform },
            { talkingTo: clientChatId },
        );
        await this.usersRepo.update(
            { chatId: clientChatId, platform },
            { talkingTo: operatorChatId },
        );
    }

    async getTalkingTo(
        operatorId: string,
        platform: UserPlatform = 'telegram',
    ) {
        const user = await this.getByChatId(operatorId, platform);
        return user?.talkingTo || null;
    }

    async findOperatorByClient(
        clientId: string,
        platform: UserPlatform = 'telegram',
    ) {
        return this.usersRepo.findOne({
            where: { talkingTo: clientId, platform },
        });
    }

    async startDialog(
        operatorId: string,
        clientId: string,
        platform: UserPlatform = 'telegram',
    ) {
        await this.setTalkingTo(operatorId, clientId, platform);
    }

    async stopDialog(
        operatorId: string,
        clientId: string,
        platform: UserPlatform = 'telegram',
    ) {
        await this.usersRepo.update(
            { chatId: operatorId, platform },
            { talkingTo: null },
        );
        await this.usersRepo.update(
            { chatId: clientId, platform },
            { talkingTo: null },
        );
    }

    async isAlreadyTalking(
        chatId: string,
        platform: UserPlatform = 'telegram',
    ) {
        return !!(await this.getByChatId(chatId, platform))?.talkingTo;
    }

    async isTalking(
        initChatId: string,
        talkingToChatId: string,
        platform: UserPlatform = 'telegram',
    ) {
        const user = await this.getByChatId(initChatId, platform);
        return user?.talkingTo === talkingToChatId;
    }

    private async upsertChannel(
        user: UserEntity,
        externalId: string,
        platform: UserPlatform,
        displayName?: string,
        username?: string,
        now = new Date(),
    ) {
        let channel = await this.channelsRepo.findOne({
            where: { externalId, platform },
        });

        if (!channel) {
            channel = this.channelsRepo.create({
                userId: user.id,
                externalId,
                platform,
                displayName,
                username,
                lastSeenAt: now,
            });
            return this.channelsRepo.save(channel);
        }

        let needUpdate = false;

        if (channel.userId !== user.id) {
            channel.userId = user.id;
            needUpdate = true;
        }

        if (displayName && channel.displayName !== displayName) {
            channel.displayName = displayName;
            needUpdate = true;
        }

        if (username && channel.username !== username) {
            channel.username = username;
            needUpdate = true;
        }

        channel.lastSeenAt = now;
        needUpdate = true;

        return needUpdate ? this.channelsRepo.save(channel) : channel;
    }
}
