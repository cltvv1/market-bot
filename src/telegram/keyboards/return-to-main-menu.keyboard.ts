import { Markup } from "telegraf";

export function mainMenuButton() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('⬅️Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}