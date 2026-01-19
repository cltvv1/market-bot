import * as fs from 'fs';
import { Context } from 'telegraf';
import { removeKeyboard } from 'telegraf/markup';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { UsersService } from 'src/users/users.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { menuButtons } from "src/telegram/keyboards/menu.keyboard";
import { IdleTextHandler } from './handlers/idle/idle-text.handler';
import { UserContextService } from 'src/userContext/user-context.service';
import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { TicketTextHandler } from './handlers/ticket/ticket-text.handler';
import { RegistrationsService } from '../registrations/registrations.service';
import { OperatorTextHandler } from './handlers/operator/operator-text.handler';
import { disconnectFromButton } from "src/telegram/keyboards/disconnect.keyboard";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";
import { RegisterTextHandler } from "src/telegram/handlers/register/register-text.handler";
import { formatRegistrationRequest, formatTicket, wantToRegisterMsg } from 'src/common/utils';
import { startRegButtons, creditsButtons, adminButtons, actualRegsButtons, actualTicketsButtons, serviceButtons } from './keyboards/keyboards';

@Update()
export class TelegramUpdate {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService,
        private readonly ticketService: TicketsService,
        private readonly usersService: UsersService,
        private readonly registerHandler: RegisterTextHandler,
        private readonly idleHandler: IdleTextHandler,
        private readonly ticketHandler: TicketTextHandler,
        private readonly operatorHandler: OperatorTextHandler,
    ) { }

    private async handleTextByMode(
        ctx: Context,
        mode: string,
        text: string,
    ) {
        switch (mode) {
            case 'IDLE':
                return this.idleHandler.handle(ctx);

            case 'REGISTER':
                return this.registerHandler.handle(ctx, text);

            case 'TICKET':
                return this.ticketHandler.handle(ctx, text);

            case 'OPERATOR':
                return this.operatorHandler.handle(ctx);
        }
    }

    private async handleMedia(
        ctx: Context,
        mode: string,
        chatId: string,
    ) {
        if (mode !== 'OPERATOR') return;

        const talkingToId = await this.usersService.getTalkingTo(chatId);
        if (!talkingToId) return;

        await ctx.copyMessage(
            talkingToId,
            disconnectFromButton(chatId),
        );
    }

    @Start()
    async startCommand(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const user = await this.usersService.getOrCreateOrUpdate(
            String(chatId),
            ctx.from?.first_name,
            ctx.from?.username,
        );

        if (user.isAdmin) {
            await ctx.reply(
                'Админское меню:',
                adminButtons(),
            );
        } else {
            await ctx.reply(
                'Я чат-бот компании ВитмаМаркет, чем могу вам помочь?',
                menuButtons(),
            );
        }

        if (ctx.message?.message_id) {
            await ctx.deleteMessage(ctx.message.message_id).catch(() => { });
        }
    }

    @Action('wantToRegister')
    async handleWantToReg(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        let reg = await this.regService.getNotFilledReg(chatId)

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

    @Action(/regDone:\d+/)
    async onRegDone(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }

        const data = query.data;

        const [, regId] = data.split(':');

        const reg = await this.regService.getRegistrationById(regId)

        if (!reg) {
            await ctx.reply('Эта заявка уже обработана!')
            return
        }
        await this.regService.doReg(reg)
        await ctx.deleteMessage(ctx.message?.message_id)
        await this.regService.notifyAdminsAboutRegDone(reg)
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

    @Action('serviceMenu')
    async sendServiceMenu(ctx: Context) {
        await ctx.editMessageText(TG_TEXTS.SERVICE_TEXT, serviceButtons());
    }

    @Action('mainMenu')
    async returnToMainMenu(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            ctx.from?.first_name,
            ctx.from?.username
        );
        try {
            await ctx.deleteMessage(ctx.message?.message_id)
        } catch {
            return
        } finally {
            if (user.isAdmin) {
                await ctx.reply(
                    'Админское меню:',
                    adminButtons()
                );
                return
            }

            await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
        }
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

        if (!(await this.usersService.isOperator(operatorChatId))) {
            await ctx.reply('Недостаточно прав');
            return;
        }

        if (await this.usersService.isAlreadyTalking(clientChatId)) {
            await ctx.deleteMessage(ctx.message?.message_id)
            await ctx.reply('К чату с этим клиентом уже подключен оператор')
            return
        }

        await this.ctxService.set(clientChatId, { mode: 'OPERATOR' })
        await this.ctxService.set(operatorChatId, { mode: 'OPERATOR' })

        await this.usersService.setTalkingTo(operatorChatId, clientChatId);

        await ctx.telegram.sendMessage(clientChatId, 'К чату с вами присоединился оператор,  он будет видеть все ваши сообщения. Вы так же можете отправить медиафайлы (Изображения/Видео).')
        await ctx.reply('Вы подключены к чату с клиентом, все ваши сообщения будут отправлены клиенту. Вы так же можете отправить медиафайлы (Изображения/Видео).');
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

        const isTalking = await this.usersService.isTalking(initChatId, talkingToChatId);
        if (!isTalking) {
            await ctx.deleteMessage(ctx.message?.message_id)
            await ctx.reply('Диалог уже завершён или недоступен');
            return;
        }

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
            await ctx.deleteMessage(ctx.message?.message_id)
            await ctx.reply('Этот вопрос больше недоступен, скорее всего, он уже был закрыт ранее')
            return
        }
        await this.ticketService.closeTicket(closedTicket.id, operatorChatId)


        await this.ctxService.set(clientChatId, { mode: 'IDLE' })
        await this.ctxService.set(operatorChatId, { mode: 'IDLE' })

        await this.usersService.stopDialog(operatorChatId, clientChatId);

        await ctx.telegram.sendMessage(clientChatId, 'Оператор отключился от чата с вами.')
        await ctx.telegram.sendMessage(operatorChatId, 'Вы отключились от чата с клиентом.')
    }

    @On('message')
    async handleMessage(
        @Ctx() ctx: Context,
        @Message('text') msgText?: string,
    ) {
        const chatId = String(ctx.chat?.id);
        if (!chatId || !ctx.message) return;

        const context = await this.ctxService.get(chatId);

        if (msgText) {
            await this.handleTextByMode(ctx, context.mode, msgText);
            return;
        }

        await this.handleMedia(ctx, context.mode, String(chatId));
    }
}