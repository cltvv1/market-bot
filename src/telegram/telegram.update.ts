import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { RegistrationsService } from '../registrations/registrations.service';
import { menuButtons, startRegButtons, creditsButtons, mainMenuButton, connectToButton, adminButtons, actualRegsButtons, actualTicketsButtons } from './keyboards';
import { formatRegistrationRequest, formatTicket, wantToRegisterMsg } from 'src/common/utils';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { removeKeyboard } from 'telegraf/markup';
import { UserContextService } from 'src/userContext/user-context.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UsersService } from 'src/users/users.service';
import * as fs from 'fs';


@Update()
export class TelegramUpdate {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService,
        private readonly ticketService: TicketsService,
        private readonly usersService: UsersService,
    ) { }

    @Start()
    async startCommand(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const user = await this.usersService.getOrCreate(
            chatId,
            ctx.from?.first_name,
            ctx.from?.username
        );
        if (user.isAdmin) {
            await ctx.reply(
                'Админское меню:',
                adminButtons()
            );
            return
        }

        await ctx.reply(
            'Я чат-бот компании ВитмаМаркет, чем могу вам помочь?',
            menuButtons()
        );
    }

    @Action('wantToRegister')
    async handleWantToReg(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let reg = await this.regService.getRegistration(chatId)

        if (!reg) {
            reg = await this.regService.createRegistration(chatId);

            const fields = await this.regService.getAllFields();
            await ctx.reply(
                wantToRegisterMsg(fields),
                startRegButtons()
            );

            return;
        }


        const context = await this.ctxService.get(chatId);
        context.mode = 'REGISTER';
        await this.ctxService.set(chatId, context);

        const fieldText = await this.regService.getFieldTextByStep(reg.currentStep);

        await ctx.reply(
            `Найдена незаполненная заявка.\nПродолжим.\n\n${fieldText}:`,
            removeKeyboard()
        );
    }

    @Action('actualRegs')
    async handleActualRegs(@Ctx() ctx: Context) {
        const actualRegs = await this.regService.getActualRegs();

        if (!actualRegs) {
            await ctx.editMessageText('Актуальных заявок нет', mainMenuButton())
            return
        }

        await ctx.editMessageText('Актуальные заявки:', actualRegsButtons(actualRegs))
    }

    @Action(/openReg:\d+/)
    async onOpenReg(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }

        const data = query.data;

        const [, regId] = data.split(':');

        const reg = await this.regService.getRegistrationById(regId)

        await ctx.editMessageText(formatRegistrationRequest(reg), mainMenuButton()); //replywithfile
    }

    @Action('actualTickets')
    async handleActualTickets(@Ctx() ctx: Context) {
        const actualTickets = await this.ticketService.getActualTickets();

        if (!actualTickets) {
            await ctx.editMessageText('Актуальных вопросов нет', mainMenuButton())
            return
        }

        await ctx.editMessageText('Актуальные вопросы:', actualTicketsButtons(actualTickets))
    }

    @Action(/openTicket:\d+/)
    async onOpenTicket(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }

        const data = query.data;

        const [, ticketId] = data.split(':');

        const ticket = await this.ticketService.getTicketById(Number(ticketId))

        await ctx.reply(formatTicket(ticket), mainMenuButton());
    }

    @Action('createTicket')
    async hadleCreateTicket(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let ticket = await this.ticketService.getActiveTicket(chatId)

        if (!ticket) {
            await this.ticketService.createTicket(chatId,
                ctx.from?.username,
                ctx.from?.first_name
            )

            const context = await this.ctxService.get(chatId);
            context.mode = 'TICKET';
            await this.ctxService.set(chatId, context)

            await ctx.editMessageText('Введите текст вопроса:')
            return
        }

        if (ticket.text) {
            ctx.editMessageText('У вас уже есть вопрос в работе, ожидайте, когда оператор подключится к чату с вами.', mainMenuButton())
            return
        }

        const context = await this.ctxService.get(chatId);
        context.mode = 'TICKET';
        await this.ctxService.set(chatId, context)

        await ctx.editMessageText('Введите текст вопроса:')
    }

    @Action('credits')
    async sendCredits(ctx: Context) {
        await ctx.editMessageText(TG_TEXTS.CREDITS_TEXT, creditsButtons());
    }

    @Action('mainMenu')
    async returnToMainMenu(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const user = await this.usersService.getOrCreate(
            chatId,
            ctx.from?.first_name,
            ctx.from?.username
        );
        if (user.isAdmin) {
            await ctx.editMessageText(
                'Хелёу админ',
                adminButtons()
            );
            return
        }

        await ctx.editMessageText('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
    }

    @Action(/connectTo:\d+/)
    async onConnectTo(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }

        const data = query.data;

        const [, clientChatId] = data.split(':');

        let clientContext = this.ctxService.get(clientChatId)
        clientContext.mode = 'OPERATOR'
        this.ctxService.set(clientChatId, clientContext)

        if (!ctx.from) return

        const operatorChatId = String(ctx.from.id);

        let operatorContext = this.ctxService.get(operatorChatId)
        operatorContext.mode = 'OPERATOR'
        this.ctxService.set(operatorChatId, operatorContext)

        await this.usersService.setTalkingTo(operatorChatId, clientChatId);

        ctx.telegram.sendMessage(clientChatId, 'К чату с вами присоединился оператор,  он будет видеть все ваши сообщения.')
        await ctx.reply('Вы подключены к чату с клиентом, все ваши сообщения будут отправлены клиенту.');
    }

    @On('text')
    async handleText(@Message('text') msgText: string, @Ctx() ctx: Context) {

        const chatId = String(ctx.chat?.id);
        if (!chatId) return;
        let reg = await this.regService.getRegistration(chatId)

        const context = await this.ctxService.get(chatId);

        switch (context.mode) {
            case 'IDLE':
                switch (msgText) {
                    case TG_TEXTS.START_REG_TEXT:

                        context.mode = 'REGISTER';
                        this.ctxService.set(chatId, context)

                        if (!reg) {
                            ctx.reply('Заявка создана', removeKeyboard())
                            reg = await this.regService.createRegistration(chatId)
                        } else {
                            await ctx.reply('Найдена незаполненная заявка', removeKeyboard())
                        }

                        const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)
                        if (!nextFieldText) {
                            ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется')
                            return
                        }
                        await ctx.reply(`${nextFieldText}:`)
                        break;
                    case TG_TEXTS.STOP_REG_TEXT:
                        await ctx.reply(TG_TEXTS.NO_PERSONAL_DATA, removeKeyboard())
                        await this.startCommand(ctx)
                        break;
                    default:
                        reg = await this.regService.getRegistration(chatId)
                        if (reg) {
                            context.mode = 'REGISTER';
                            this.ctxService.set(chatId, context)

                            const reg = await this.regService.saveFieldValue(chatId, msgText)
                            if (!reg) return

                            const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)

                            if (!nextFieldText) {
                                await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется', mainMenuButton())
                                context.mode = 'IDLE'
                                await this.ctxService.set(chatId, context)
                                return
                            } else await ctx.reply(`${nextFieldText}:`)
                        } else {
                            //если есть тикет не заполненный, то полученный текст в тикет
                        }// else если открыт чат с оператором то контекст сеттим и полученный мсг оператору отправляем
                        //else
                        await ctx.reply('Выберете команду из меню, сейчас вы не заполняете анкету и не переписываетесь с оператором', menuButtons())
                        break;
                }
                break;
            case 'REGISTER':
                reg = await this.regService.saveFieldValue(chatId, msgText)
                if (!reg) return

                const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)

                if (!nextFieldText) {
                    const filePath = await this.regService.finishReg(reg);
                    await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется', mainMenuButton())

                    await ctx.replyWithDocument({
                        source: fs.createReadStream(filePath),
                        filename: `registration_${reg.id}.pdf`
                    });

                    context.mode = 'IDLE'
                    await this.ctxService.set(chatId, context)
                    return
                } else await ctx.reply(`${nextFieldText}:`)
                break;
            case 'TICKET':
                const ticket = await this.ticketService.saveTicketText(chatId, msgText)
                if (!ticket) return

                context.mode = 'IDLE'
                await this.ctxService.set(chatId, context)
                ctx.reply(formatTicket(ticket), connectToButton(chatId))

                ctx.reply('Ваш вопрос принят, оператор ответит в ближайшее время')
                break;
            case 'OPERATOR':

                //save msgtext as msg to operator
                break;
        }
    }
}