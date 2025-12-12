import * as fs from 'fs';
import { Context } from 'telegraf';
import { removeKeyboard } from 'telegraf/markup';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { UsersService } from 'src/users/users.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserContextService } from 'src/userContext/user-context.service';
import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { RegistrationsService } from '../registrations/registrations.service';
import { formatRegistrationRequest, formatTicket, wantToRegisterMsg } from 'src/common/utils';
import { menuButtons, startRegButtons, creditsButtons, mainMenuButton, connectToButton, adminButtons, actualRegsButtons, actualTicketsButtons, disconnectFromButton } from './keyboards';


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

        await ctx.deleteMessage(ctx.message?.message_id)
    }

    @Action('wantToRegister')
    async handleWantToReg(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let reg = await this.regService.getRegistration(chatId)

        await this.ctxService.set(chatId, { mode: 'REGISTER' })

        if (!reg) {
            const fields = await this.regService.getAllFields();
            await ctx.reply(
                wantToRegisterMsg(fields),
                startRegButtons()
            );

            return;
        }

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

        if (!reg) {
            return
        }
        await ctx.deleteMessage(ctx.message?.message_id)
        await ctx.reply(formatRegistrationRequest(reg), mainMenuButton());


        if (reg.pdfPath) {
            await ctx.replyWithDocument({
                source: fs.createReadStream(reg.pdfPath),
                filename: `registration_${reg.id}.pdf`
            });
            return
        }
        await ctx.reply('Pdf-файл не найден')
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

            await this.ctxService.set(chatId, { mode: 'TICKET' })

            await ctx.editMessageText('Введите текст вопроса:')
            return
        }

        if (ticket.text) {
            ctx.editMessageText('У вас уже есть вопрос в работе, ожидайте, когда оператор подключится к чату с вами.', mainMenuButton())
            return
        }

        await this.ctxService.set(chatId, { mode: 'TICKET' })

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

        ctx.deleteMessage(ctx.message?.message_id)

        if (user.isAdmin) {
            await ctx.reply(
                'Панель администратора:',
                adminButtons()
            );
            return
        }

        await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
    }

    @Action(/connectTo:\d+/)
    async onConnectTo(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }
        if (!ctx.from) return

        const [, clientChatId] = query.data.split(':');
        const operatorChatId = String(ctx.from.id);

        if (await this.usersService.isAlreadyTalking(clientChatId)) {
            await ctx.reply('К чату с этим клиентом уже подключен оператор')
            return
        }

        await this.ctxService.set(clientChatId, { mode: 'OPERATOR' })
        await this.ctxService.set(operatorChatId, { mode: 'OPERATOR' })

        await this.usersService.setTalkingTo(operatorChatId, clientChatId);

        ctx.telegram.sendMessage(clientChatId, 'К чату с вами присоединился оператор,  он будет видеть все ваши сообщения.')
        await ctx.reply('Вы подключены к чату с клиентом, все ваши сообщения будут отправлены клиенту.');
    }

    @Action(/disconnectFrom:\d+/)
    async onDisconnectFrom(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }
        if (!ctx.from) return

        const data = query.data;

        const [, talkingToChatId] = data.split(':');
        const initChatId = String(ctx.from.id);

        let operatorChatId
        let clientChatId
        if (await this.usersService.isOperator(initChatId)) {
            operatorChatId = initChatId
            clientChatId = talkingToChatId
        }
        else {
            operatorChatId = talkingToChatId
            clientChatId = initChatId
        }

        let closedTicket = await this.ticketService.getActiveTicket(clientChatId)

        if (!closedTicket) {
            ctx.reply('Этот вопрос больше недоступен, скорее всего, он уже был закрыт ранее')
            return
        }
        await this.ticketService.closeTicket(closedTicket.id, operatorChatId)


        await this.ctxService.set(clientChatId, { mode: 'IDLE' })
        await this.ctxService.set(operatorChatId, { mode: 'IDLE' })

        await this.usersService.stopDialog(operatorChatId, clientChatId);

        await ctx.telegram.sendMessage(clientChatId, 'Оператор отключился от чата с вами.')
        await ctx.telegram.sendMessage(operatorChatId, 'Вы отключились от чата с клиентом.')
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

                        await this.ctxService.set(chatId, { mode: 'REGISTER' })

                        if (reg) {
                            await ctx.reply('Найдена незаполненная заявка', removeKeyboard())
                        } else {
                            reg = await this.regService.createRegistration(chatId)
                            await ctx.reply('Заявка создана', removeKeyboard())
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
                            await this.ctxService.set(chatId, { mode: 'REGISTER' })

                            const reg = await this.regService.saveFieldValue(chatId, msgText)
                            if (!reg) return

                            const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)

                            if (!nextFieldText) {
                                await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется', mainMenuButton())

                                await this.ctxService.set(chatId, { mode: 'IDLE' })
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
                        await this.startCommand(ctx)

                        await this.ctxService.set(chatId, { mode: 'IDLE' })

                        break;
                    default:
                        reg = await this.regService.saveFieldValue(chatId, msgText)
                        if (!reg) return

                        nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep)

                        if (!nextFieldText) {
                            const filePath = await this.regService.finishReg(reg);
                            await ctx.reply('Анкета заполнена, в ближайшее время оператор с вами свяжется', mainMenuButton())

                            await ctx.replyWithDocument({
                                source: fs.createReadStream(filePath),
                                filename: `registration_${reg.id}.pdf`
                            });

                            await this.ctxService.set(chatId, { mode: 'IDLE' })
                            return
                        } else await ctx.reply(`${nextFieldText}:`)
                        break;
                }
                break;
            case 'TICKET':
                const ticket = await this.ticketService.saveTicketText(chatId, msgText)
                if (!ticket) {
                    await ctx.reply('У вас нет созданного вопроса', mainMenuButton())

                    await this.ctxService.set(chatId, { mode: 'IDLE' })

                    return
                }

                await this.ctxService.set(chatId, { mode: 'IDLE' })

                await this.ticketService.notifyOperatorsAboutNewTicket(ticket)

                await ctx.reply('Ваш вопрос принят, оператор ответит в ближайшее время')
                break;
            case 'OPERATOR':
                const talkingToId = await this.usersService.getTalkingTo(chatId);
                if (!talkingToId) {
                    await ctx.reply('К вам сейчас не подключен оператор', mainMenuButton())

                    await this.ctxService.set(chatId, { mode: 'IDLE' })

                    return
                }
                await ctx.copyMessage(talkingToId, disconnectFromButton(chatId));
                break;
        }
    }

    @On('message')
    async onMedia(@Ctx() ctx: Context) {

        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        if (!ctx.message) return

        const talkingToId = await this.usersService.getTalkingTo(chatId);
        if (!talkingToId) return

        if ('text' in ctx.message) return;

        //await ctx.forwardMessage(talkingToId);
        await ctx.copyMessage(talkingToId, disconnectFromButton(chatId));

    }
}
