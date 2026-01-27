import { Markup } from "telegraf";

export function actualTicketsButtons(tickets) {
    const buttons = tickets.map(ticket =>
        Markup.button.callback(
            `Вопрос #${ticket.id}  - ${ticket.text} | от ${ticket.createdAt.toLocaleDateString()}`,
            `openTicket:${ticket.id}`
        )
    );

    buttons.push(Markup.button.callback('⬅️Вернуться в главное меню', 'mainMenu'))

    return Markup.inlineKeyboard(buttons, { columns: 1 });
}