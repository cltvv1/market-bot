import * as fs from 'fs';
import { Context, Markup } from 'telegraf';
import { removeKeyboard } from 'telegraf/markup';
import { TG_TEXTS } from 'src/texts/telegram.texts';
import { UsersService } from 'src/users/users.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { creditsButtons } from './keyboards/credits.keyboard';
import { serviceButtons } from './keyboards/service.keyboard';
import { startRegButtons } from './keyboards/start-reg.keyboard';
import { menuButtons } from "src/telegram/keyboards/menu.keyboard";
import { IdleTextHandler } from './handlers/idle/idle-text.handler';
import { actualRegsButtons } from './keyboards/actual-regs.keyboard';
import { UserContextService } from 'src/userContext/user-context.service';
import { Start, On, Ctx, Message, Update, Action } from 'nestjs-telegraf';
import { TicketTextHandler } from './handlers/ticket/ticket-text.handler';
import { actualTicketsButtons } from './keyboards/actual-tickets.keyboard';
import { RegistrationsService } from '../registrations/registrations.service';
import { OperatorTextHandler } from './handlers/operator/operator-text.handler';
import { disconnectFromButton } from "src/telegram/keyboards/disconnect.keyboard";
import { mainMenuButton } from "src/telegram/keyboards/return-to-main-menu.keyboard";
import { RegisterTextHandler } from "src/telegram/handlers/register/register-text.handler";
import { formatRegistrationRequest, formatTicket, wantToRegisterMsg } from 'src/common/utils';
import { ClientWorkflowService } from 'src/client/client-workflow.service';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import type { TicketMediaInput } from 'src/tickets/tickets.service';
import type { SimpleServiceRequestCode } from 'src/client/client-workflow.types';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';


@Update()
export class TelegramUpdate {
    constructor(
        private readonly regService: RegistrationsService,
        private readonly ctxService: UserContextService,
        private readonly ticketService: TicketsService,
        private readonly usersService: UsersService,
        private readonly clientWorkflow: ClientWorkflowService,
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly registerHandler: RegisterTextHandler,
        private readonly idleHandler: IdleTextHandler,
        private readonly ticketHandler: TicketTextHandler,
        private readonly operatorHandler: OperatorTextHandler,
    ) { }

    private toClientIdentity(ctx: Context) {
        return {
            chatId: String(ctx.chat?.id),
            platform: 'telegram' as const,
            name: ctx.from?.first_name,
            username: ctx.from?.username,
        };
    }

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

            case 'SERVICE_REQUEST':
                return this.handleServiceRequestText(ctx, text);

            case 'OPERATOR':
                return this.operatorHandler.handle(ctx);
        }
    }

    private async handleMedia(
        ctx: Context,
        mode: string,
        chatId: string,
    ) {
        const media = await this.extractTelegramMedia(ctx);
        if (!media) return;

        if (mode === 'TICKET') {
            await this.clientWorkflow.submitTicketMedia(this.toClientIdentity(ctx), media);
            await this.ctxService.set(chatId, { mode: 'IDLE' });
            await ctx.reply('Вложение принято, оператор ответит в ближайшее время.', mainMenuButton());
            return;
        }

        if (mode === 'REGISTER') {
            const result = await this.clientWorkflow.submitRegistrationPhoto(this.toClientIdentity(ctx), {
                buffer: await this.downloadMediaBuffer(media),
                fileName: media.fileName || `${media.messageType}.jpg`,
            });
            if (result.status === 'completed') {
                await ctx.reply(TG_TEXTS.REG_FILLED, { parse_mode: 'HTML', ...mainMenuButton() });
                await this.ctxService.set(chatId, { mode: 'IDLE' });
                return;
            }
            await ctx.reply(result.nextField ? `${result.nextField}:` : 'Фото принято.');
            return;
        }

        if (mode === 'IDLE') {
            const activeTicket = await this.ticketService.getActiveTicket(chatId);
            if (activeTicket?.text) {
                await this.clientWorkflow.submitTicketMedia(this.toClientIdentity(ctx), media);
                await ctx.reply('Вложение добавлено к вашему открытому вопросу.');
                return;
            }
        }

        if (mode !== 'OPERATOR') return;

        const talkingToId = await this.usersService.getTalkingTo(chatId);
        if (!talkingToId) return;

        await ctx.copyMessage(
            talkingToId,
            disconnectFromButton(chatId),
        );

        const activeTicket = await this.ticketService.getActiveTicket(talkingToId);
        if (activeTicket) {
            await this.ticketService.addMediaMessage(activeTicket.id, 'operator', media, chatId, 'bot');
        }
    }

    private async extractTelegramMedia(ctx: Context): Promise<TicketMediaInput | null> {
        const message = ctx.message as any;
        if (!message) return null;

        const withUrl = async (media: TicketMediaInput) => {
            if (!media.fileId) return media;
            try {
                media.externalUrl = String(await ctx.telegram.getFileLink(media.fileId));
            } catch {
                // Telegram file links are helpful for the web admin, but the bot can still work without them.
            }
            return media;
        };

        if (message.photo?.length) {
            const photo = message.photo[message.photo.length - 1];
            return withUrl({
                messageType: 'image',
                text: message.caption,
                fileId: photo.file_id,
                fileUniqueId: photo.file_unique_id,
                fileSize: photo.file_size,
            });
        }

        if (message.video) {
            return withUrl({
                messageType: 'video',
                text: message.caption,
                fileId: message.video.file_id,
                fileUniqueId: message.video.file_unique_id,
                fileName: message.video.file_name,
                mimeType: message.video.mime_type,
                fileSize: message.video.file_size,
            });
        }

        if (message.voice) {
            return withUrl({
                messageType: 'voice',
                fileId: message.voice.file_id,
                fileUniqueId: message.voice.file_unique_id,
                mimeType: message.voice.mime_type,
                fileSize: message.voice.file_size,
            });
        }

        if (message.audio) {
            return withUrl({
                messageType: 'audio',
                text: message.caption,
                fileId: message.audio.file_id,
                fileUniqueId: message.audio.file_unique_id,
                fileName: message.audio.file_name,
                mimeType: message.audio.mime_type,
                fileSize: message.audio.file_size,
            });
        }

        if (message.video_note) {
            return withUrl({
                messageType: 'video_note',
                fileId: message.video_note.file_id,
                fileUniqueId: message.video_note.file_unique_id,
                fileSize: message.video_note.file_size,
            });
        }

        if (message.document) {
            return withUrl({
                messageType: 'document',
                text: message.caption,
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id,
                fileName: message.document.file_name,
                mimeType: message.document.mime_type,
                fileSize: message.document.file_size,
            });
        }

        return null;
    }

    @Start()
    async startCommand(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        await this.clientWorkflow.upsertClient(this.toClientIdentity(ctx));
        await ctx.reply(
            'Я чат-бот компании ВитмаМаркет, чем могу вам помочь?',
            menuButtons(),
        );

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

        const regAuthor = await this.usersService.getOrCreateOrUpdate(reg.chatId)
        await ctx.reply(formatRegistrationRequest(reg, regAuthor), mainMenuButton());


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

        const result = await this.clientWorkflow.openTicket(this.toClientIdentity(ctx));

        if (result.status === 'already_open') {
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

    @Action('fnReplacement')
    async onFnReplacement(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const result = await this.serviceRequestsService.start(this.toClientIdentity(ctx), 'fn_replacement');
        await this.ctxService.set(chatId, { mode: 'SERVICE_REQUEST', serviceRequestId: result.request.id });
        await ctx.reply('Начинаем заявку на замену фискального накопителя.');
        await this.replyServiceRequestStep(ctx, result);
    }

    @Action(/^serviceRequestAnswer:\d+:.+/)
    async onServiceRequestButtonAnswer(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;
        if (!query || !('data' in query)) return;

        const [, requestId, value] = query.data.split(':');
        await ctx.answerCbQuery();
        const result = await this.serviceRequestsService.answer(this.toClientIdentity(ctx), Number(requestId), value);
        await this.ctxService.set(String(ctx.chat?.id), { mode: 'SERVICE_REQUEST', serviceRequestId: result.request.id });
        await this.replyServiceRequestStep(ctx, result);
    }

    @Action(/^serviceRequestConfirm:\d+/)
    async onServiceRequestConfirm(@Ctx() ctx: Context) {
        const query = ctx.callbackQuery;
        if (!query || !('data' in query)) return;

        const [, requestId] = query.data.split(':');
        await ctx.answerCbQuery();
        const result = await this.serviceRequestsService.confirmPrice(this.toClientIdentity(ctx), Number(requestId));
        await this.ctxService.set(String(ctx.chat?.id), { mode: 'IDLE', serviceRequestId: null });
        await ctx.reply(`Заявка #${result.request.id} отправлена оператору. Оператор подготовит счет и пришлет его вам.`, mainMenuButton());
    }

    @Action('mainMenu')
    async returnToMainMenu(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        await this.clientWorkflow.upsertClient(this.toClientIdentity(ctx));
        try {
            await ctx.deleteMessage(ctx.message?.message_id)
        } catch {
            return
        } finally {
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

    @Action(/^serviceRequestSimple:.+/)
    async onSimpleServiceRequest(@Ctx() ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const query = ctx.callbackQuery;

        if (!query || !('data' in query)) {
            return;
        }

        const data = query.data;

        const [, rawType] = data.split(':');

        if (!this.isSimpleServiceRequestCode(rawType)) {
            await ctx.answerCbQuery('Неизвестный тип заявки');
            return;
        }
        const result = await this.clientWorkflow.startSimpleServiceRequest({ ...this.toClientIdentity(ctx), serviceTypeCode: rawType });
        const request = result.data as { id?: number } | undefined;
        await this.ctxService.set(chatId, { mode: 'SERVICE_REQUEST', serviceRequestId: request?.id })

        if (!result.nextField) {
            await this.ctxService.set(chatId, { mode: 'IDLE', serviceRequestId: null })
            await ctx.reply('Заявка создана, ожидайте ответа оператора', mainMenuButton());
            return;
        }

        await ctx.reply(`${result.nextField}:`);
    }

    private async handleServiceRequestText(ctx: Context, text: string) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const context = await this.ctxService.get(chatId);
        if (!context.serviceRequestId) {
            await this.ctxService.set(chatId, { mode: 'IDLE' });
            await ctx.reply('Заявка не найдена. Начните новую заявку из меню.', mainMenuButton());
            return;
        }

        const result = await this.serviceRequestsService.answer(this.toClientIdentity(ctx), context.serviceRequestId, text);
        await this.replyServiceRequestStep(ctx, result);
    }

    private async downloadMediaBuffer(media: TicketMediaInput) {
        if (!media.externalUrl) {
            throw new Error('Media URL was not resolved');
        }
        const response = await fetch(media.externalUrl);
        if (!response.ok) {
            throw new Error(`Failed to download media: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }

    private async replyServiceRequestStep(ctx: Context, result: ReturnType<ServiceRequestsService['present']>) {
        if (result.nextStep) {
            if (result.nextStep.options?.length) {
                await ctx.reply(
                    `${result.nextStep.label}:`,
                    Markup.inlineKeyboard(
                        result.nextStep.options.map((option) =>
                            Markup.button.callback(option.label, `serviceRequestAnswer:${result.request.id}:${option.value}`),
                        ),
                        { columns: 1 },
                    ),
                );
                return;
            }

            await ctx.reply(`${result.nextStep.label}:`);
            return;
        }

        if (!result.isReadyForConfirmation) {
            await this.ctxService.set(String(ctx.chat?.id), { mode: 'IDLE', serviceRequestId: null });
            await ctx.reply('Сервисная заявка создана. Оператор свяжется с вами в ближайшее время.', mainMenuButton());
            return;
        }

        const priceText = result.request.calculatedPrice
            ? `${result.request.calculatedPrice} руб.`
            : 'стоимость уточнит оператор';
        await ctx.reply(
            `Стоимость замены ФН: ${priceText}\n\nЕсли все верно, подтвердите заказ счета.`,
            Markup.inlineKeyboard([
                Markup.button.callback('Согласен, заказать счет', `serviceRequestConfirm:${result.request.id}`),
            ]),
        );
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
            if (msgText.trim().startsWith('/admin')) {
                await this.handleAdminBindCommand(ctx, msgText);
                return;
            }

            if (context.mode === 'IDLE') {
                const activeTicket = await this.ticketService.getActiveTicket(chatId);
                if (activeTicket?.text) {
                    await this.clientWorkflow.submitTicketMessage(this.toClientIdentity(ctx), msgText);
                    await ctx.reply('Сообщение добавлено к вашему открытому вопросу.');
                    return;
                }
            }

            await this.handleTextByMode(ctx, context.mode, msgText);
            return;
        }

        await this.handleMedia(ctx, context.mode, String(chatId));
    }

    private async handleAdminBindCommand(ctx: Context, text: string) {
        const chatId = String(ctx.chat?.id);
        const code = text.trim().split(/\s+/)[1];
        if (!chatId || !code) {
            await ctx.reply('Введите команду с кодом из веб-админки: /admin КОД');
            return;
        }

        const admin = await this.adminNotificationsService.linkChatByCode(code, 'telegram', chatId);
        if (!admin) {
            await ctx.reply('Код не найден или уже истек. Сгенерируйте новый код в веб-админке.');
            return;
        }

        await ctx.reply(`Готово. Telegram-уведомления подключены для ${admin.displayName}.`);
    }

    private isSimpleServiceRequestCode(value: string): value is SimpleServiceRequestCode {
        return value === 'firmware_update' || value === 'kkt_remote_work';
    }
}
