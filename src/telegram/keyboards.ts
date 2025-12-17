import { TG_TEXTS } from "src/texts/telegram.texts";
import { Markup } from "telegraf";

export function menuButtons() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('📝 Регистрация кассы', 'wantToRegister'),
            Markup.button.callback('🔌 Активация ОФД', 'wantToOfd'),
            Markup.button.callback('💬 Вопрос оператору', 'createTicket'),
            Markup.button.callback('❓ Часто задаваемые вопросы', 'faqRoot'),
            Markup.button.callback('🛒 Наши страницы на маркетплейсах', 'credits'),
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
            Markup.button.callback('Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}


export function mainMenuButton() {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Вернуться в главное меню', 'mainMenu'),
        ],
        {
            columns: 1
        }
    )
}

export function connectToButton(chatId: string) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Подключиться в чат к клиенту', 'connectTo:' + chatId),
        ],
        {
            columns: 1
        }
    )
}

export function disconnectFromButton(chatId: string) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Вопрос закрыт, закрыть чат.', 'disconnectFrom:' + chatId),
        ],
        {
            columns: 1
        }
    )
}

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

export function actualRegsButtons(regs) {
    const buttons = regs.map(reg =>
        Markup.button.callback(
            `Заявка #${reg.id} — ${reg.orgName ?? 'без названия'} | от ${reg.createdAt.toLocaleDateString()}`,
            `openReg:${reg.id}`
        )
    );

    buttons.push(Markup.button.callback('Вернуться в главное меню', 'mainMenu'))

    return Markup.inlineKeyboard(buttons, { columns: 1 });
}

export function actualTicketsButtons(tickets) {
    const buttons = tickets.map(ticket =>
        Markup.button.callback(
            `Вопрос #${ticket.id}  - ${ticket.text} | от ${ticket.createdAt.toLocaleDateString()}`,
            `openTicket:${ticket.id}`
        )
    );

    buttons.push(Markup.button.callback('Вернуться в главное меню', 'mainMenu'))

    return Markup.inlineKeyboard(buttons, { columns: 1 });
}

export function regDoneButton(regId: number) {
    return Markup.inlineKeyboard(
        [
            Markup.button.callback('Заявка обработана', 'regDone:' + regId),
        ],
        {
            columns: 1
        }
    )
}