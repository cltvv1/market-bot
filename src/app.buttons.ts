import { Markup } from "telegraf";

export function menuButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Оставить заявку на регистрацию кассы', 'registration'),
            Markup.button.callback('Задать вопрос оператору', 'create_ticket'),
            Markup.button.callback('Часто задаваемые вопросы', 'faq_root'),
            Markup.button.callback('Наши страницы на маркетплейсах', 'credits'),
        ],
        {
            columns: 1
        }
    )
}

export function creditsButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.url('Wildberries', 'https://www.wildberries.ru/seller/4232548'),
            Markup.button.url('Ozon', 'https://www.ozon.ru/seller/vitmamarket-2650110/?miniapp=seller_2650110'),
            Markup.button.callback('Вернуться в главное меню', 'main_menu'),
        ],
        {
            columns: 1
        }
    )
}