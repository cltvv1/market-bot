import { Markup } from "telegraf";

export function disconnectFromButton(chatId: string) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('❌Вопрос закрыт, закрыть чат.', 'disconnectFrom:' + chatId),
        ],
        {
            columns: 1
        }
    )
}