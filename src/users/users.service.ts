import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity, UserPlatform } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepo: Repository<UserEntity>,
    ) { }

    async getOrCreateOrUpdate(
        chatId: string,
        name?: string,
        username?: string,
        platform: UserPlatform = 'telegram',
    ) {
        let user = await this.usersRepo.findOne({ where: { chatId, platform } });

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

        return user;
    }

    async getByChatId(chatId: string, platform: UserPlatform = 'telegram') {
        return this.usersRepo.findOne({ where: { chatId, platform } });
    }

    async isAdmin(chatId: string, platform: UserPlatform = 'telegram') {
        const user = await this.getByChatId(chatId, platform);
        return user?.isAdmin === true;
    }

    async isOperator(chatId: string, platform: UserPlatform = 'telegram') {
        const user = await this.getByChatId(chatId, platform);
        return user?.isOperator === true;
    }

    async update(chatId: string, partial: Partial<UserEntity>, platform: UserPlatform = 'telegram') {
        await this.usersRepo.update({ chatId, platform }, partial);
        return this.getByChatId(chatId, platform);
    }

    async setTalkingTo(operatorChatId: string, clientChatId: string) {
        await this.usersRepo.update({ chatId: operatorChatId, platform: 'telegram' }, { talkingTo: clientChatId });
        await this.usersRepo.update({ chatId: clientChatId, platform: 'telegram' }, { talkingTo: operatorChatId });
    }

    async getTalkingTo(operatorId: string) {
        const user = await this.getByChatId(operatorId);
        return user?.talkingTo || null;
    }

    async findOperatorByClient(clientId: string) {
        return this.usersRepo.findOne({
            where: { talkingTo: clientId, platform: 'telegram' },
        });
    }

    async startDialog(operatorId: string, clientId: string) {
        await this.setTalkingTo(operatorId, clientId);
    }

    async stopDialog(operatorId: string, clientId: string) {
        await this.usersRepo.update({ chatId: operatorId, platform: 'telegram' }, { talkingTo: null });
        await this.usersRepo.update({ chatId: clientId, platform: 'telegram' }, { talkingTo: null });
    }

    async getOperators(platform?: UserPlatform) {
        return this.usersRepo.find({
            where: {
                isOperator: true,
                ...(platform ? { platform } : {}),
            },
        });
    }

    async getAdmins(platform?: UserPlatform) {
        return this.usersRepo.find({
            where: {
                isAdmin: true,
                ...(platform ? { platform } : {}),
            },
        });
    }

    async isAlreadyTalking(chatId: string) {
        return !!(await this.getByChatId(chatId))?.talkingTo;
    }

    async isTalking(initChatId: string, talkingToChatId: string) {
        const user = await this.getByChatId(initChatId);
        return user?.talkingTo === talkingToChatId;
    }
}
