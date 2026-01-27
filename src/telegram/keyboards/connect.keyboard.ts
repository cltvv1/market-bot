import { Markup } from "telegraf";

export function connectToButton(chatId: string) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Подключиться в чат к клиенту', 'connectTo:' + chatId),
        ],
        {
            columns: 1
        }
    )
}