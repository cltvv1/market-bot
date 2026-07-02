import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';
import {
    MessengerDocument,
    MessengerMessageOptions,
    MessengerService,
} from './messenger.types';

@Injectable()
export class TelegramMessengerService implements MessengerService {
    constructor(@InjectBot() private bot: Telegraf) { }

    async sendMessage(chatId: string | number, text: string, options?: MessengerMessageOptions) {
        return this.bot.telegram.sendMessage(chatId, text, this.toTelegramExtra(options));
    }

    async sendDocument(chatId: string | number, file: MessengerDocument, options?: MessengerMessageOptions) {
        return this.bot.telegram.sendDocument(chatId, file, this.toTelegramExtra(options));
    }

    private toTelegramExtra(options?: MessengerMessageOptions) {
        if (!options) return undefined;

        const extra: Record<string, unknown> = {};

        if (options.parseMode) {
            extra.parse_mode = options.parseMode;
        }

        if (options.inlineKeyboard) {
            extra.reply_markup = Markup.inlineKeyboard(
                options.inlineKeyboard.buttons.map((button) =>
                    Markup.button.callback(button.text, button.callbackData),
                ),
                { columns: options.inlineKeyboard.columns ?? 1 },
            ).reply_markup;
        }

        return extra;
    }
}
