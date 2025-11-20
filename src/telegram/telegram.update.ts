import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { RegistrationsService } from '../registrations/registrations.service';
import { menuButtons, startRegButtons, creditsButtons, mainMenuButton } from './keyboards';
import { showFields, showRegs, wantToRegisterMsg } from 'src/common/utils';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { removeKeyboard } from 'telegraf/markup';
import { UserContextService } from 'src/UserContext/user-context.service';

@Update()
export class TelegramUpdate {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService
    ) { }

    @Start()
    async startCommand(ctx: Context) {
        await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
    }

    @Action('wantToRegister')
    async handleWantToReg(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let reg = await this.regService.getRegistration(chatId)

        if (!reg) {
            const fields = await this.regService.getAllFields();

            await ctx.reply(wantToRegisterMsg(fields), startRegButtons());
        } else {
            const context = await this.ctxService.get(chatId);
            context.mode = 'REGISTER';
            await this.ctxService.set(chatId, context)

            await ctx.reply('Найдена незаполненная заявка', removeKeyboard())
            const nextFieldText = await this.regService.getNextFieldText(reg.currentStep)
            if (!nextFieldText) {
                await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется')
                this.startCommand(ctx)
                return
            }
            await ctx.reply(`Введите ${nextFieldText}`)
        }
    }

    @Action('credits')
    async sendCredits(ctx: Context) {
        await ctx.editMessageText(TG_TEXTS.CREDITS_TEXT, creditsButtons());
    }

    @Action('main_menu')
    async returnToMainMenu(ctx: Context) {
        ctx.editMessageText('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
    }


    @On('text')
    async handleText(@Message('text') msgText: string, @Ctx() ctx: Context) {

        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        if (msgText == '/allregs') {
            const regs = await this.regService.getAllRegs();
            ctx.reply(showRegs(regs))
            return
        }
        if (msgText == '/allfields') {
            const fields = await this.regService.getAllFields();
            ctx.reply(showFields(fields))
            return
        }

        const context = this.ctxService.get(chatId);

        switch (context.mode) {
            case 'IDLE':
                //проверить если есть активная заявка то конктест на reg если пустой вопрос то ticket если у админа есть талкинг ту с этим айдишником то оператор(forwardmessage)
                switch (msgText) {
                    case TG_TEXTS.START_REG_TEXT:

                        context.mode = 'REGISTER';
                        this.ctxService.set(chatId, context)

                        let reg = await this.regService.getRegistration(chatId)

                        if (!reg) {
                            ctx.reply('Заявка создана', removeKeyboard())
                            reg = await this.regService.createRegistration(chatId)
                        } else {
                            await ctx.reply('Найдена незаполненная заявка', removeKeyboard())
                        }

                        const nextFieldText = await this.regService.getNextFieldText(reg.currentStep)
                        if (!nextFieldText) {
                            ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется')
                            return
                        }
                        await ctx.reply(`Введите ${nextFieldText}`)
                        break;
                    case TG_TEXTS.STOP_REG_TEXT:
                        await ctx.reply(TG_TEXTS.NO_PERSONAL_DATA, removeKeyboard())
                        await this.startCommand(ctx)
                        break;
                    default:
                        await ctx.reply('Выберете команду из меню, сейчас вы не заполняете анкету и не переписываетесь с оператором', menuButtons())
                        break;
                }
                break;
            case 'REGISTER':
                const reg = await this.regService.saveFieldValue(chatId, msgText)
                if (!reg) return
                const nextFieldText = await this.regService.getNextFieldText(reg.currentStep)
                if (!nextFieldText) {
                    await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется', mainMenuButton())
                    context.mode = 'IDLE'
                    await this.ctxService.set(chatId, context)
                    return
                }
                await ctx.reply(`Введите ${nextFieldText}`)
                break;
            case 'TICKET':
                //save msgtext as ticket text
                break;
            case 'OPERATOR':
                //save msgtext as msg to operator
                break;
        }
    }
}