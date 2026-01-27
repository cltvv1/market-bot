import { Markup } from "telegraf";

export function bidDoneButton(bidId: number) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('✅Заявка обработана', 'bidDone:' + bidId),
        ],
        {
            columns: 1
        }
    )
}