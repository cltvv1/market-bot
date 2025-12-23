import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { UsersService } from "src/users/users.service";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { disconnectFromButton } from "src/telegram/keyboards/disconnect.keyboard";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";

@Injectable()
export class OperatorTextHandler implements TextHandler {
    constructor(
        private readonly usersService: UsersService,
        private readonly ctxService: UserContextService,
    ) { }

    async handle(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const talkingToId = await this.usersService.getTalkingTo(chatId);
        if (!talkingToId) {
            await ctx.reply('К вам сейчас не подключен оператор', mainMenuButton())

            await this.ctxService.set(chatId, { mode: 'IDLE' })

            return
        }
        await ctx.copyMessage(talkingToId, disconnectFromButton(chatId));
    }
}

