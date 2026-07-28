import { MessengerInlineKeyboard } from './messenger.types';

export function regDoneKeyboard(regId: number): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: '✅ Заявка обработана',
                callbackData: `regDone:${regId}`,
            },
        ],
        columns: 1,
    };
}

export function connectToKeyboard(chatId: string): MessengerInlineKeyboard {
    return {
        buttons: [
            {
                text: 'Подключиться в чат к клиенту',
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
                text: '❌ Вопрос закрыт, закрыть чат',
                callbackData: `disconnectFrom:${chatId}`,
            },
        ],
        columns: 1,
    };
}
