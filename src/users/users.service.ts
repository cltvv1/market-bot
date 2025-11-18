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

    async findOrCreate(chatId: string, data?: Partial<UserEntity>) {
        let user = await this.usersRepo.findOne({ where: { chatId } });

        if (!user) {
            user = this.usersRepo.create({ chatId, ...data });
            await this.usersRepo.save(user);
        } else if (data) {
            await this.usersRepo.update({ chatId }, data);
            user = await this.usersRepo.findOne({ where: { chatId } });
        }

        return user;
    }

    async isAdmin(chatId: string) {
        const user = await this.usersRepo.findOne({ where: { chatId } });
        return user?.isAdmin ?? false;
    }

    async get(chatId: string) {
        return this.usersRepo.findOne({ where: { chatId } });
    }

    async setTalkingTo(chatId: string, targetChatId: string | null) {
        await this.usersRepo.update({ chatId }, { talkingTo: targetChatId });
    }

    async getTalkingTo(chatId: string) {
        const user = await this.usersRepo.findOne({ where: { chatId } });
        return user?.talkingTo ?? null;
    }

    async getAdminTalkingTo(userChatId: string) {
        return this.usersRepo.findOne({
            where: { talkingTo: userChatId, isAdmin: true },
        });
    }

    async getUserTalkingTo(adminChatId: string) {
        const admin = await this.usersRepo.findOne({ where: { chatId: adminChatId } });
        if (!admin) return null;
        if (!admin.talkingTo) return null;

        return this.usersRepo.findOne({ where: { chatId: admin.talkingTo } });
    }
}
