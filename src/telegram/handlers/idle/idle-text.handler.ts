import { Context } from "telegraf";
import { menuButtons } from "src/telegram/keyboards/menu.keyboard";
import { TextHandler } from "../interfaces/text-handler.interface";



export class IdleTextHandler implements TextHandler {
    async handle(ctx: Context) {
        await ctx.reply('Выберете команду из меню, сейчас вы не заполняете анкету и не переписываетесь с оператором:', menuButtons())

    }
}