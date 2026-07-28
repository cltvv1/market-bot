import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import {
    MessengerDocument,
    MessengerMessageOptions,
    MessengerService,
} from './messenger.types';

@Injectable()
export class MaxMessengerService implements MessengerService {
    private readonly bot?: Bot;

    constructor(configService: ConfigService) {
        const token = configService.get<string>('MAX_BOT_TOKEN');
        if (token) {
            this.bot = new Bot(token);
        }
    }

    async sendMessage(chatId: string | number, text: string, options?: MessengerMessageOptions) {
        if (!this.bot) {
            throw new Error('MAX_BOT_TOKEN is not defined in environment variables');
        }

        return this.bot.api.sendMessageToChat(this.toMaxChatId(chatId), text, this.toMaxExtra(options));
    }

    async sendImage(chatId: string | number, file: MessengerDocument, options?: MessengerMessageOptions) {
        if (!this.bot) {
            throw new Error('MAX_BOT_TOKEN is not defined in environment variables');
        }

        const attachment = await this.bot.api.uploadImage({ source: file.source as any });

        return this.bot.api.sendMessageToChat(
            this.toMaxChatId(chatId),
            options?.caption || '',
            {
                ...this.toMaxExtra(options),
                attachments: [attachment.toJson()],
            },
        );
    }

    async sendDocument(chatId: string | number, file: MessengerDocument, options?: MessengerMessageOptions) {
        if (!this.bot) {
            throw new Error('MAX_BOT_TOKEN is not defined in environment variables');
        }

        const attachment = await this.bot.api.uploadFile({ source: file.source as any });

        return this.bot.api.sendMessageToChat(
            this.toMaxChatId(chatId),
            options?.caption || file.filename,
            {
                ...this.toMaxExtra(options),
                attachments: [attachment.toJson()],
            },
        );
    }

    private toMaxExtra(options?: MessengerMessageOptions) {
        if (!options) return undefined;

        const attachments: any[] = [];

        if (options.inlineKeyboard) {
            const buttons = options.inlineKeyboard.buttons.map((button) => [
                Keyboard.button.callback(button.text, button.callbackData),
            ]);

            attachments.push(Keyboard.inlineKeyboard(buttons));
        }

        return {
            format: options.parseMode?.toLowerCase() as 'html' | 'markdown' | undefined,
            attachments,
        };
    }

    private toMaxChatId(chatId: string | number): number {
        const value = Number(chatId);
        if (!Number.isSafeInteger(value)) {
            throw new Error(`Invalid MAX chat id: ${chatId}`);
        }

        return value;
    }
}
