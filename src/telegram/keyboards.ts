import { TG_TEXTS } from "src/texts/telegram.texts";
import { Markup } from "telegraf";

export function menuButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Оставить заявку на регистрацию кассы', 'wantToRegister'),
            Markup.button.callback('Задать вопрос оператору', 'create_ticket'),
            Markup.button.callback('Часто задаваемые вопросы', 'faq_root'),
            Markup.button.callback('Наши страницы на маркетплейсах', 'credits'),
        ],
        {
            columns: 1
        }
    )
}

export function startRegButtons() {
    return Markup.keyboard(
        [
            Markup.button.text(TG_TEXTS.START_REG_TEXT),
            Markup.button.text(TG_TEXTS.STOP_REG_TEXT)
        ],
        {
            columns: 1
        }
    ).resize()
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
