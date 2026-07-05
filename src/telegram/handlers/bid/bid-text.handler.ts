import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";
import { BidService } from "src/bids/bids.service";
import { ClientWorkflowService } from "src/client/client-workflow.service";
@Injectable()
export class BidTextHandler implements TextHandler {
    constructor(
        private readonly bidService: BidService,
        private readonly ctxService: UserContextService,
        private readonly clientWorkflow: ClientWorkflowService,
    ) { }

    async handle(ctx: Context, msgText: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const result = await this.clientWorkflow.submitBidAnswer({
            chatId,
            platform: 'telegram',
            name: ctx.from?.first_name,
            username: ctx.from?.username,
        }, msgText);
        if (result.status === 'not_found') {
            await ctx.reply('Заявка не найдена, создайте новую из главного меню', mainMenuButton())
            return
        }

        if (result.nextField) {
            await ctx.reply(`${result.nextField}:`)
            return;
        }

        await ctx.reply('Заявка создана, ожидайте ответа оператора', mainMenuButton());

        await this.ctxService.set(chatId, { mode: 'IDLE' })
        return
    }
}
