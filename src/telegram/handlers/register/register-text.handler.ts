import { Context } from "telegraf";
import { Injectable } from "@nestjs/common";
import { removeKeyboard } from 'telegraf/markup';
import { TG_TEXTS } from "src/texts/telegram.texts";
import { menuButtons } from "src/telegram/keyboards/menu.keyboard";
import { TextHandler } from "../interfaces/text-handler.interface";
import { UserContextService } from "src/userContext/user-context.service";
import { RegistrationsService } from "src/registrations/registrations.service";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";
import { ClientWorkflowService } from "src/client/client-workflow.service";

@Injectable()
export class RegisterTextHandler implements TextHandler {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService,
        private readonly clientWorkflow: ClientWorkflowService,
    ) { }

    async handle(ctx: Context, msgText: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let nextFieldText;
        switch (msgText) {
            case TG_TEXTS.START_REG_TEXT:
                const startResult = await this.clientWorkflow.startRegistration({
                    chatId,
                    platform: 'telegram',
                    name: ctx.from?.first_name,
                    username: ctx.from?.username,
                });

                await ctx.reply(startResult.status === 'started'
                    ? 'Заявка создана'
                    : 'Найдена незаполненная заявка',
                    removeKeyboard()
                )
                nextFieldText = startResult.nextField
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
                const answerResult = await this.clientWorkflow.submitRegistrationAnswer({
                    chatId,
                    platform: 'telegram',
                    name: ctx.from?.first_name,
                    username: ctx.from?.username,
                }, msgText);
                if (answerResult.status === 'not_found') {
                    await ctx.reply('Вы не подтвердили согласие с обработкой персональных данных, заявка на регистрацию не была создана. \n\nДля продолжения нажмите на одну из кнопок внизу экрана.')
                    return
                }

                nextFieldText = answerResult.nextField

                if (!nextFieldText) {
                    await ctx.reply(
                        TG_TEXTS.REG_FILLED, {
                        parse_mode: 'HTML', ...mainMenuButton()
                    });

                    await this.ctxService.set(chatId, { mode: 'IDLE' })
                    return
                }
                await ctx.reply(`${nextFieldText}:`)
                break;
        }
    }
}
