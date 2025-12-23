import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { removeKeyboard } from 'telegraf/markup';
import { TG_TEXTS } from "src/texts/telegram.texts";
import { menuButtons } from "src/telegram/keyboards/menu.keyboard";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { RegistrationsService } from "src/registrations/registrations.service";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";

@Injectable()
export class RegisterTextHandler implements TextHandler {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService,
    ) { }

    async handle(ctx: Context, msgText: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let reg = await this.regService.getNotFilledReg(chatId)
        let nextFieldText;
        switch (msgText) {
            case TG_TEXTS.START_REG_TEXT:
                if (reg) {
                    await ctx.reply('Найдена незаполненная заявка', removeKeyboard())
                } else {
                    reg = await this.regService.createRegistration(chatId)
                    await ctx.reply('Заявка создана', removeKeyboard())
                }

                nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)
                if (!nextFieldText) {
                    ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется')
                    return
                }
                await ctx.reply(`${nextFieldText}:`)
                break;
            case TG_TEXTS.STOP_REG_TEXT:
                await ctx.reply(TG_TEXTS.NO_PERSONAL_DATA, removeKeyboard())
                await ctx.reply(
                    'Я чат-бот компании ВитмаМаркет, чем могу вам помочь?',
                    menuButtons()
                );

                await this.ctxService.set(chatId, { mode: 'IDLE' })

                break;
            default:
                reg = await this.regService.saveFieldValue(chatId, msgText)
                if (!reg) {
                    await ctx.reply('Вы не подтвердили согласие с обработкой персональных данных, заявка на регистрацию не была создана. \n\nДля продолжения нажмите на одну из кнопок внизу экрана.')
                    return
                }

                nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)

                if (!nextFieldText) {
                    const filePath = await this.regService.finishReg(reg);

                    await ctx.reply(
                        TG_TEXTS.REG_FILLED, {
                        parse_mode: 'HTML', ...mainMenuButton()
                    });

                    await this.regService.notifyAdminsAboutNewReg(reg, filePath)
                    await this.ctxService.set(chatId, { mode: 'IDLE' })
                    return
                }
                await ctx.reply(`${nextFieldText}:`)
                break;
        }
    }
}
