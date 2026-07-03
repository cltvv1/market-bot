import { MessengerInlineKeyboard } from './messenger.types';

export function regDoneKeyboard(regId: number): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: 'вњ…Р—Р°СЏРІРєР° РѕР±СЂР°Р±РѕС‚Р°РЅР°',
                callbackData: `regDone:${regId}`,
            },
        ],
        columns: 1,
    };
}

export function bidDoneKeyboard(bidId: number): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: 'вњ…Р—Р°СЏРІРєР° РѕР±СЂР°Р±РѕС‚Р°РЅР°',
                callbackData: `bidDone:${bidId}`,
            },
        ],
        columns: 1,
    };
}

export function connectToKeyboard(chatId: string): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: 'РџРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ РІ С‡Р°С‚ Рє РєР»РёРµРЅС‚Сѓ',
                callbackData: `connectTo:${chatId}`,
            },
        ],
        columns: 1,
    };
}

export function disconnectFromKeyboard(chatId: string): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: 'вќЊР’РѕРїСЂРѕСЃ Р·Р°РєСЂС‹С‚, Р·Р°РєСЂС‹С‚СЊ С‡Р°С‚.',
                callbackData: `disconnectFrom:${chatId}`,
            },
        ],
        columns: 1,
    };
}
