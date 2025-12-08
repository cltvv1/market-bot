import { Injectable } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { Telegraf } from "telegraf";

@Injectable()
export class TelegramService {
    constructor(@InjectBot() private bot: Telegraf) { }

    async sendMessage(chatId: string, text: string, extra?) {
        return this.bot.telegram.sendMessage(chatId, text, extra);
    }
}
