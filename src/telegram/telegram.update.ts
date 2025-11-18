import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { RegistrationsService, RegistrationFieldsService } from '../registrations/registrations.service';
import { menuButtons, startRegButtons, creditsButtons } from './keyboards';
import { wantToRegisterMsg } from 'src/common/utils';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { removeKeyboard } from 'telegraf/markup';
import { UserContextService } from 'src/UserContext/user-context.service';

@Update()
export class TelegramUpdate {
    constructor(
        private readonly fieldsService: RegistrationFieldsService,
        private readonly registrationsService: RegistrationsService,
        private readonly ctxService: UserContextService
    ) { }

    @Start()
    async startCommand(ctx: Context) {
        await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
    }

    @Action('wantToRegister')
    async handleWantToReg(@Ctx() ctx: Context) {
        if (!ctx.chat || !ctx.chat.id) return;

        const fields = await this.fieldsService.getAllFieldsOrdered();

        await ctx.reply(wantToRegisterMsg(fields), startRegButtons());
    }

    @Action('credits')
    async sendCredits(ctx: Context) {
        await ctx.editMessageText(TG_TEXTS.CREDITS_TEXT, creditsButtons());
    }


    @On('text')
    async handleText(@Message('text') msgText: string, @Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const context = this.ctxService.get(chatId)

        switch (context.mode) {
            case 'IDLE':
                switch (msgText) {
                    case TG_TEXTS.START_REG_TEXT:
                        //context.mode = 'REGISTER';
                        //startReg Flow
                        break;
                    case TG_TEXTS.STOP_REG_TEXT:
                        await ctx.reply(TG_TEXTS.NO_PERSONAL_DATA, removeKeyboard())
                        await this.startCommand(ctx)
                        break;
                    default:
                        break;
                }
                break;
            case 'REGISTER':
                //save msgtext to db as reg field
                break;
            case 'TICKET':
                //save msgtext as ticket text
                break;
            case 'OPERATOR':
                //save msgtext as msg to operator
                break
            default:
                break;

        }
    }
}