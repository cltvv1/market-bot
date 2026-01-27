import { Markup } from "telegraf";

export function creditsButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.url('🛒Wildberries', 'https://www.wildberries.ru/seller/4232548'),
            Markup.button.callback('⬅️Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}