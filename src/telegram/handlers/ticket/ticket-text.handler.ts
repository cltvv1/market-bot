import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { TicketsService } from "src/tickets/tickets.service";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";

@Injectable()
export class TicketTextHandler implements TextHandler {
    constructor(
        private readonly ticketService: TicketsService,
        private readonly ctxService: UserContextService,
    ) { }

    async handle(ctx: Context, msgText: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const ticket = await this.ticketService.saveTicketText(chatId, msgText)
        if (!ticket) {
            await ctx.reply('У вас нет созданного вопроса', mainMenuButton())

            await this.ctxService.set(chatId, { mode: 'IDLE' })

            return
        }

        await this.ctxService.set(chatId, { mode: 'IDLE' })

        await this.ticketService.notifyOperatorsAboutNewTicket(ticket)

        await ctx.reply('Ваш вопрос принят, оператор ответит в ближайшее время');
    }
}
