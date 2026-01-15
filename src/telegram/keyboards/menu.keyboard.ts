import { Markup } from "telegraf";

export function menuButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('🛠 Заявка по сервису', 'serviceMenu'),
            Markup.button.callback('💬 Вопрос оператору', 'createTicket'),
            //Markup.button.callback('🤖 Вопрос ИИ', 'createAiRequest'),
            Markup.button.callback('🛒 Наши страницы на маркетплейсах', 'credits'),
        ],
        {
            columns: 1
        }
    )
}