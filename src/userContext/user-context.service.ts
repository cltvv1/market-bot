import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { UserDialogStateEntity } from './entities/user-dialog-state.entity';
import type { UserContext } from './user-context.types';

@Injectable()
export class UserContextService {
    constructor(
        @InjectRepository(UserDialogStateEntity)
        private readonly contexts: Repository<UserDialogStateEntity>,
    ) {}

    async get(
        chatId: string,
        platform: UserPlatform = 'telegram',
    ): Promise<UserContext> {
        const context = await this.contexts.findOne({
            where: { chatId, platform },
        });
        if (!context) return { mode: 'IDLE' };

        return {
            mode: context.mode,
            talkingTo: context.talkingTo,
            serviceRequestId: context.serviceRequestId,
        };
    }

    async set(
        chatId: string,
        context: Partial<UserContext>,
        platform: UserPlatform = 'telegram',
    ): Promise<UserContext> {
        const existing = await this.contexts.findOne({
            where: { chatId, platform },
        });
        const saved = await this.contexts.save(
            existing
                ? Object.assign(existing, context)
                : this.contexts.create({
                      chatId,
                      platform,
                      mode: context.mode ?? 'IDLE',
                      talkingTo: context.talkingTo ?? null,
                      serviceRequestId: context.serviceRequestId ?? null,
                  }),
        );

        return {
            mode: saved.mode,
            talkingTo: saved.talkingTo,
            serviceRequestId: saved.serviceRequestId,
        };
    }

    async reset(chatId: string, platform: UserPlatform = 'telegram') {
        return this.set(
            chatId,
            { mode: 'IDLE', talkingTo: null, serviceRequestId: null },
            platform,
        );
    }
}
