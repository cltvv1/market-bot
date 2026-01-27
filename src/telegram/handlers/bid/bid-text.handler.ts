import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";
import { BidService } from "src/bids/bids.service";
@Injectable()
export class BidTextHandler implements TextHandler {
    constructor(
        private readonly bidService: BidService,
        private readonly ctxService: UserContextService,
    ) { }

    async handle(ctx: Context, msgText: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let bid = await this.bidService.getNotFilledBid(chatId)
        bid = await this.bidService.saveFieldValue(chatId, msgText)
        if (!bid) {
            await ctx.reply('Заявка не найдена, создайте новую из главного меню', mainMenuButton())
            return
        }

        const nextFieldText = await this.bidService.getFieldTextByStep(bid.currentStep);

        if (nextFieldText) {
            await ctx.reply(`${nextFieldText}:`)
            return;
        }

        await this.bidService.finishBid(bid);
        await ctx.reply('Заявка создана, ожидайте ответа оператора', mainMenuButton());

        await this.bidService.notifyAdminsAboutNewBid(bid)
        await this.ctxService.set(chatId, { mode: 'IDLE' })
        return
    }
}
