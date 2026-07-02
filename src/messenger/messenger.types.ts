export interface MessengerInlineButton {
    text: string;
    callbackData: string;
}

export interface MessengerInlineKeyboard {
    buttons: MessengerInlineButton[];
    columns?: number;
}

export interface MessengerMessageOptions {
    inlineKeyboard?: MessengerInlineKeyboard;
    parseMode?: 'HTML' | 'Markdown';
}

export interface MessengerDocument {
    source: NodeJS.ReadableStream;
    filename: string;
}

export interface MessengerService {
    sendMessage(chatId: string | number, text: string, options?: MessengerMessageOptions): Promise<unknown>;
    sendDocument(chatId: string | number, file: MessengerDocument, options?: MessengerMessageOptions): Promise<unknown>;
}

export const MESSENGER_SERVICE = Symbol('MESSENGER_SERVICE');
