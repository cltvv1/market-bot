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

    /** Находит пользователя или создаёт */
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

    /** Получить пользователя */
    async getByChatId(chatId: string) {
        return this.usersRepo.findOne({ where: { chatId } });
    }

    /** Проверка ролей */
    async isAdmin(chatId: string) {
        const user = await this.getByChatId(chatId);
        return user?.isAdmin === true;
    }

    async isOperator(chatId: string) {
        const user = await this.getByChatId(chatId);
        return user?.isOperator === true;
    }

    /** Обновить любые поля */
    async update(chatId: string, partial: Partial<UserEntity>) {
        await this.usersRepo.update({ chatId }, partial);
        return this.getByChatId(chatId);
    }

    /** Установить, с кем сейчас ведёт диалог */
    async setTalkingTo(operatorId: string, clientId: string | null) {
        await this.usersRepo.update(
            { chatId: operatorId },
            { talkingTo: clientId },
        );
    }

    /** Получить, с кем оператор сейчас разговаривает */
    async getTalkingTo(operatorId: string) {
        const user = await this.getByChatId(operatorId);
        return user?.talkingTo || null;
    }

    /** Найти операторов, которые сейчас разговаривают с конкретным клиентом */
    async findOperatorByClient(clientId: string) {
        return this.usersRepo.findOne({
            where: { talkingTo: clientId },
        });
    }

    /** Начать операторский диалог */
    async startDialog(operatorId: string, clientId: string) {
        await this.setTalkingTo(operatorId, clientId);
    }

    /** Завершить операторский диалог */
    async stopDialog(operatorId: string) {
        await this.setTalkingTo(operatorId, null);
    }
}
