import { Markup } from "telegraf";

export function actualRegsButtons(regs) {
    const buttons = regs.map(reg =>
        Markup.button.callback(
            `Заявка #${reg.id} — ${reg.orgName ?? 'без названия'} | от ${reg.createdAt.toLocaleDateString()}`,
            `openReg:${reg.id}`
        )
    );

    buttons.push(Markup.button.callback('⬅️Вернуться в главное меню', 'mainMenu'))

    return Markup.inlineKeyboard(buttons, { columns: 1 });
}