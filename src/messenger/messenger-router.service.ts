import { Injectable } from '@nestjs/common';
import type { UserPlatform } from 'src/users/entities/user.entity';
import {
    MessengerDocument,
    MessengerMessageOptions,
    MessengerService,
} from './messenger.types';
import { MaxMessengerService } from './max-messenger.service';
import { TelegramMessengerService } from './telegram-messenger.service';

@Injectable()
export class MessengerRouterService implements MessengerService {
    constructor(
        private readonly telegramMessenger: TelegramMessengerService,
        private readonly maxMessenger: MaxMessengerService,
    ) { }

    async sendMessage(chatId: string | number, text: string, options?: MessengerMessageOptions) {
        return this.getMessenger(options?.platform).sendMessage(chatId, text, options);
    }

    async sendDocument(chatId: string | number, file: MessengerDocument, options?: MessengerMessageOptions) {
        return this.getMessenger(options?.platform).sendDocument(chatId, file, options);
    }

    private getMessenger(platform: UserPlatform = 'telegram') {
        switch (platform) {
            case 'max':
                return this.maxMessenger;
            case 'web':
                throw new Error('Web clients do not have a messenger transport');
            case 'telegram':
            default:
                return this.telegramMessenger;
        }
    }
}
