import { bidTypeToText } from "src/bids/bid.types";
import { Markup } from "telegraf";

export function serviceButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('📝 Регистрация кассы', 'wantToRegister'),
            Markup.button.callback('🔄 Замена ФН', 'fnReplacement'),
            Markup.button.callback('🔌 Активация ОФД', 'wantToOfd'),
            Markup.button.callback(bidTypeToText('FIRMWARE_UPDATE'), 'bid:FIRMWARE_UPDATE'),
            Markup.button.callback(bidTypeToText('KKT_REMOTE_WORK'), 'bid:KKT_REMOTE_WORK'),
            Markup.button.callback('⬅️Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}