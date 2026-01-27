import { Markup } from "telegraf";

export function adminButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('📋 Заявки на регистрацию (в работе)', 'actualRegs'),
            Markup.button.callback('🔌 Заявки на активацию ОФД (в работе)', 'actualOfds'),
            Markup.button.callback('❗ Неотвеченные вопросы', 'actualTickets')
        ],
        {
            columns: 1
        }
    )
}