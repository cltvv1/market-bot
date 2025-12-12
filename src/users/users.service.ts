import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepo: Repository<UserEntity>,
    ) { }

    async getOrCreate(chatId: string, name?: string, username?: string) {
        let user = await this.usersRepo.findOne({ where: { chatId } });

        if (!user) {
            user = this.usersRepo.create({
                chatId,
                name,
                username,
                fmDate: new Date().toLocaleDateString('ru-RU'),
            });
            await this.usersRepo.save(user);
        }

        return user;
    }

    async getByChatId(chatId: string) {
        return this.usersRepo.findOne({ where: { chatId } });
    }

    async isAdmin(chatId: string) {
        const user = await this.getByChatId(chatId);
        return user?.isAdmin === true;
    }

    async isOperator(chatId: string) {
        const user = await this.getByChatId(chatId);
        return user?.isOperator === true;
    }

    async update(chatId: string, partial: Partial<UserEntity>) {
        await this.usersRepo.update({ chatId }, partial);
        return this.getByChatId(chatId);
    }

    async setTalkingTo(operatorChatId: string, clientChatId: string) {
        await this.usersRepo.update({ chatId: operatorChatId }, { talkingTo: clientChatId });
        await this.usersRepo.update({ chatId: clientChatId }, { talkingTo: operatorChatId });
    }


    async getTalkingTo(operatorId: string) {
        const user = await this.getByChatId(operatorId);
        return user?.talkingTo || null;
    }

    async findOperatorByClient(clientId: string) {
        return this.usersRepo.findOne({
            where: { talkingTo: clientId },
        });
    }

    async startDialog(operatorId: string, clientId: string) {
        await this.setTalkingTo(operatorId, clientId);
    }

    async stopDialog(operatorId: string, clientId: string) {
        await this.usersRepo.update({ chatId: operatorId }, { talkingTo: null });
        await this.usersRepo.update({ chatId: clientId }, { talkingTo: null });
    }

    async getOperators() {
        return this.usersRepo.find({ where: { isOperator: true } });
    }

    async getAdmins() {
        return this.usersRepo.find({ where: { isAdmin: true } });
    }

    async isAlreadyTalking(chatId: string) {
        return !!(await this.getByChatId(chatId))?.talkingTo;
    }
}
