import { Markup } from "telegraf";

export function regDoneButton(regId: number) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('✅Заявка обработана', 'regDone:' + regId),
        ],
        {
            columns: 1
        }
    )
}
