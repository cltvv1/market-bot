import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramSenderService {
    constructor(@InjectBot() private bot: Telegraf) { }

    async sendMessage(chatId: string | number, text: string, extra?: any) {
        return this.bot.telegram.sendMessage(chatId, text, extra);
    }

    async sendDocument(chatId: string | number, file: any, extra?: any) {
        return this.bot.telegram.sendDocument(chatId, file, extra);
    }
}
