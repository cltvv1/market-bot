import { Markup } from "telegraf";

export function serviceButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Регистрация кассы', 'wantToRegister'),
            Markup.button.callback('Замена ФН', 'fnReplacement'),
            Markup.button.callback('Согласие на доступ АТОЛ', 'atolConsent'),
            Markup.button.callback('Активация ОФД', 'wantToOfd'),
            Markup.button.callback('Обновление прошивки', 'serviceRequestSimple:firmware_update'),
            Markup.button.callback('Удаленные работы с ККТ', 'serviceRequestSimple:kkt_remote_work'),
            Markup.button.callback('Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}
