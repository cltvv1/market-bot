import * as fs from 'fs';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { RegistrationsService } from 'src/registrations/registrations.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserContextService } from 'src/userContext/user-context.service';
import { UsersService } from 'src/users/users.service';
import { disconnectFromKeyboard } from 'src/messenger/messenger-keyboards';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { ClientWorkflowService } from 'src/client/client-workflow.service';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import type { TicketMediaInput } from 'src/tickets/tickets.service';
import type { SimpleServiceRequestCode } from 'src/client/client-workflow.types';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';

@Injectable()
export class MaxUpdate implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MaxUpdate.name);
    private bot?: Bot;

    constructor(
        private readonly configService: ConfigService,
        private readonly regService: RegistrationsService,
        private readonly ticketService: TicketsService,
        private readonly ctxService: UserContextService,
        private readonly usersService: UsersService,
        private readonly clientWorkflow: ClientWorkflowService,
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly adminNotificationsService: AdminNotificationsService,
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
    ) { }

    async onModuleInit() {
        const token = this.configService.get<string>('MAX_BOT_TOKEN');
        if (!token) {
            this.logger.warn('MAX_BOT_TOKEN is not defined, MAX bot polling is disabled');
            return;
        }

        this.bot = new Bot(token);

        this.bot.catch((error) => {
            this.logger.error('MAX bot update failed', error);
        });

        this.bot.on('bot_started', async (ctx) => {
            await this.upsertUser(ctx);
            await this.sendMainMenu(ctx);
        });

        this.bot.command('start', async (ctx) => {
            await this.upsertUser(ctx);
            await this.sendMainMenu(ctx);
        });

        this.bot.action('mainMenu', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Главное меню' });
            await this.ctxService.set(String(ctx.chatId), { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
        });

        this.bot.action('wantToRegister', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Регистрация кассы' });
            await this.showRegistrationIntro(ctx);
        });

        this.bot.action('startRegistration', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Начинаем заполнение' });
            await this.startRegistration(ctx);
        });

        this.bot.action('stopRegistration', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Заявка отменена' });
            await this.ctxService.set(String(ctx.chatId), { mode: 'IDLE' }, 'max');
            await ctx.reply('Вы отказались от обработки персональных данных. Заявка не создана.');
            await this.sendMainMenu(ctx);
        });

        this.bot.action('createTicket', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Вопрос оператору' });
            await this.startTicket(ctx);
        });

        this.bot.action(/^serviceRequestSimple:.+/, async (ctx) => {
            const rawType = ctx.callback?.payload?.split(':')[1];
            await ctx.answerOnCallback({ notification: 'Сервисная заявка' });
            await this.startSimpleServiceRequest(ctx, rawType);
        });

        this.bot.action('fnReplacement', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Замена ФН' });
            await this.startFnReplacement(ctx);
        });

        this.bot.action('atolConsent', async (ctx) => {
            await ctx.answerOnCallback({ notification: 'Согласие АТОЛ' });
            await this.startAtolConsent(ctx);
        });

        this.bot.action(/^serviceRequestAnswer:\d+:.+/, async (ctx) => {
            const [, requestId, value] = ctx.callback?.payload?.split(':') ?? [];
            await ctx.answerOnCallback({ notification: 'Ответ сохранен' });
            await this.answerServiceRequest(ctx, Number(requestId), value);
        });

        this.bot.action(/^serviceRequestConfirm:\d+/, async (ctx) => {
            const [, requestId] = ctx.callback?.payload?.split(':') ?? [];
            await ctx.answerOnCallback({ notification: 'Заявка отправлена' });
            await this.confirmServiceRequest(ctx, Number(requestId));
        });

        this.bot.action(/^connectTo:\d+/, async (ctx) => {
            const clientChatId = ctx.callback?.payload?.split(':')[1];
            await ctx.answerOnCallback({ notification: 'Подключение к чату' });
            await this.connectToClient(ctx, clientChatId);
        });

        this.bot.action(/^disconnectFrom:\d+/, async (ctx) => {
            const talkingToChatId = ctx.callback?.payload?.split(':')[1];
            await ctx.answerOnCallback({ notification: 'Завершаем чат' });
            await this.disconnectFromClient(ctx, talkingToChatId);
        });

        this.bot.on('message_created', async (ctx) => {
            await this.upsertUser(ctx);

            const text = ctx.message?.body?.text?.trim();
            const media = this.extractMaxMedia(ctx);
            if (text?.startsWith('/admin')) {
                await this.handleAdminBindCommand(ctx, text);
                return;
            }
            if ((!text && !media) || text?.startsWith('/')) return;

            const chatId = String(ctx.chatId);
            const context = await this.ctxService.get(chatId, 'max');

            if (media) {
                await this.handleMaxMedia(ctx, context.mode, media);
                return;
            }

            if (!text) return;

            if (context.mode === 'REGISTER') {
                await this.handleRegistrationText(ctx, text);
                return;
            }

            if (context.mode === 'SERVICE_REQUEST') {
                await this.handleServiceRequestText(ctx, text);
                return;
            }

            if (context.mode === 'ATOL_CONSENT') {
                await this.handleAtolConsentText(ctx, text);
                return;
            }

            if (context.mode === 'TICKET') {
                await this.handleTicketText(ctx, text);
                return;
            }

            if (context.mode === 'OPERATOR') {
                await this.forwardOperatorText(ctx, text);
                return;
            }

            const activeTicket = await this.ticketService.getActiveTicket(chatId, 'max');
            if (activeTicket?.text) {
                await this.clientWorkflow.submitTicketMessage(this.toClientIdentity(ctx), text);
                await ctx.reply('Сообщение добавлено к вашему открытому вопросу.');
                return;
            }

            await ctx.reply('Выберите действие из меню.');
            await this.sendMainMenu(ctx);
        });

        this.bot.start({
            allowedUpdates: ['bot_started', 'message_created', 'message_callback'],
        })
            .then(() => this.logger.log('MAX bot polling stopped'))
            .catch((error) => this.logger.error('MAX bot polling failed', error));

        this.logger.log('MAX bot polling started');
    }

    onModuleDestroy() {
        this.bot?.stop();
    }

    private async upsertUser(ctx: any) {
        if (!ctx.chatId) return;

        await this.clientWorkflow.upsertClient(this.toClientIdentity(ctx));
    }

    private async handleAdminBindCommand(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const code = text.trim().split(/\s+/)[1];
        if (!chatId || !code) {
            await ctx.reply('Введите команду с кодом из веб-админки: /admin КОД');
            return;
        }

        const admin = await this.adminNotificationsService.linkChatByCode(code, 'max', chatId);
        if (!admin) {
            await ctx.reply('Код не найден или уже истек. Сгенерируйте новый код в веб-админке.');
            return;
        }

        await ctx.reply(`Готово. MAX-уведомления подключены для ${admin.displayName}.`);
    }

    private toClientIdentity(ctx: any) {
        return {
            chatId: String(ctx.chatId),
            platform: 'max' as const,
            name: ctx.user?.name,
            username: ctx.user?.username ?? undefined,
        };
    }

    private async sendMainMenu(ctx: any) {
        await ctx.reply(
            'Я чат-бот компании ВитмаМаркет. Чем могу помочь?',
            {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('Регистрация кассы', 'wantToRegister')],
                        [Keyboard.button.callback('Замена ФН', 'fnReplacement')],
                        [Keyboard.button.callback('Согласие на доступ АТОЛ', 'atolConsent')],
                        [Keyboard.button.callback('Сервисная заявка: обновление прошивки', 'serviceRequestSimple:firmware_update')],
                        [Keyboard.button.callback('Сервисная заявка: удаленные работы с ККТ', 'serviceRequestSimple:kkt_remote_work')],
                        [Keyboard.button.callback('Вопрос оператору', 'createTicket')],
                    ]),
                ],
            },
        );
    }

    private async showRegistrationIntro(ctx: any) {
        const fields = await this.regService.getAllFields();
        const fieldList = fields
            .map((field) => `- ${field.label}`)
            .join('\n');

        await ctx.reply(
            `Для регистрации кассы понадобятся данные:\n\n${fieldList}\n\nПродолжая заполнение, вы соглашаетесь с обработкой персональных данных.`,
            {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('Начать заполнение', 'startRegistration')],
                        [Keyboard.button.callback('Отказаться', 'stopRegistration')],
                        [Keyboard.button.callback('Главное меню', 'mainMenu')],
                    ]),
                ],
            },
        );
    }

    private async startRegistration(ctx: any) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.startRegistration(this.toClientIdentity(ctx));

        await ctx.reply(result.status === 'started'
            ? 'Заявка создана.'
            : 'Найдена незаполненная заявка. Продолжим с места остановки.');

        await this.ctxService.set(chatId, { mode: 'REGISTER' }, 'max');

        if (!result.nextField) {
            await ctx.reply('Анкета уже заполнена.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        await ctx.reply(`${result.nextField}:`);
    }

    private async handleRegistrationText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.submitRegistrationAnswer(this.toClientIdentity(ctx), text);

        if (result.status === 'not_found') {
            await ctx.reply('Заявка не найдена. Начните регистрацию из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        if (result.nextField) {
            await ctx.reply(`${result.nextField}:`);
            return;
        }

        await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');

        await ctx.reply(
            'Анкета заполнена.  ближайшее время оператор свяжется с вами по контактному телефону, указанному в заявке.',
        );
        await this.sendMainMenu(ctx);
    }

    private async startSimpleServiceRequest(ctx: any, rawType?: string) {
        const chatId = String(ctx.chatId);

        if (!rawType || !this.isSimpleServiceRequestCode(rawType)) {
            await ctx.reply('Неизвестный тип сервисной заявки.');
            await this.sendMainMenu(ctx);
            return;
        }

        const result = await this.clientWorkflow.startSimpleServiceRequest({ ...this.toClientIdentity(ctx), serviceTypeCode: rawType });
        const request = result.data as { id?: number; serviceTypeTitle?: string } | undefined;

        await ctx.reply(result.status === 'started'
            ? `Создана сервисная заявка: ${request?.serviceTypeTitle ?? 'сервис'}.`
            : 'Найдена незаполненная сервисная заявка. Продолжим с места остановки.');

        await this.ctxService.set(chatId, { mode: 'SERVICE_REQUEST', serviceRequestId: request?.id }, 'max');

        if (!result.nextField) {
            await this.finishServiceRequest(ctx);
            return;
        }

        await ctx.reply(`${result.nextField}:`);
    }

    private async handleSimpleServiceRequestText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.submitSimpleServiceRequestAnswer(this.toClientIdentity(ctx), text);

        if (result.status === 'not_found') {
            await ctx.reply('Сервисная заявка не найдена. Создайте новую из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        if (result.nextField) {
            await ctx.reply(`${result.nextField}:`);
            return;
        }

        await this.finishServiceRequest(ctx);
    }

    private async finishServiceRequest(ctx: any) {
        await this.ctxService.set(String(ctx.chatId), { mode: 'IDLE' }, 'max');

        await ctx.reply('Сервисная заявка создана. Оператор свяжется с вами в ближайшее время.');
        await this.sendMainMenu(ctx);
    }

    private async startFnReplacement(ctx: any) {
        const chatId = String(ctx.chatId);
        const result = await this.serviceRequestsService.start(this.toClientIdentity(ctx), 'fn_replacement');
        await this.ctxService.set(chatId, { mode: 'SERVICE_REQUEST', serviceRequestId: result.request.id }, 'max');
        await ctx.reply('Начинаем заявку на замену фискального накопителя.');
        await this.replyServiceRequestStep(ctx, result);
    }

    private async startAtolConsent(ctx: any) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.startAtolConsent(this.toClientIdentity(ctx));
        await this.ctxService.set(chatId, { mode: 'ATOL_CONSENT' }, 'max');

        await ctx.reply(result.status === 'started'
            ? 'Сформируем согласие на дистанционный доступ АТОЛ. Я задам несколько вопросов и отправлю готовый PDF.'
            : 'Нашел незаполненное согласие. Продолжим с места остановки.');

        if (result.nextField) {
            await ctx.reply(`${result.nextField}:`);
            return;
        }

        await ctx.reply('Согласие уже сформировано. Отправьте фото или скан подписанного документа.');
    }

    private async handleAtolConsentText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.submitAtolConsentAnswer(this.toClientIdentity(ctx), text);
        if (result.status === 'not_found') {
            await ctx.reply('Согласие не найдено. Начните оформление заново из меню сервиса.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        if (result.nextField) {
            await ctx.reply(`${result.nextField}:`);
            return;
        }

        if (result.filePath && fs.existsSync(result.filePath)) {
            await this.messengerService.sendDocument(
                chatId,
                {
                    source: fs.createReadStream(result.filePath),
                    filename: 'atol_consent.pdf',
                },
                { platform: 'max' },
            );
        }

        await ctx.reply('Теперь распечатайте эту форму, подпишите ее. Для ИП достаточно подписи, для ООО желательно поставить печать при наличии. После этого отправьте сюда фото или скан подписанного согласия.');
    }

    private async handleServiceRequestText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const context = await this.ctxService.get(chatId, 'max');
        if (!context.serviceRequestId) {
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await ctx.reply('Заявка не найдена. Начните новую заявку из меню.');
            await this.sendMainMenu(ctx);
            return;
        }

        await this.answerServiceRequest(ctx, context.serviceRequestId, text);
    }

    private async answerServiceRequest(ctx: any, requestId: number, value?: string) {
        if (!requestId || !value) return;

        const result = await this.serviceRequestsService.answer(this.toClientIdentity(ctx), requestId, value);
        await this.ctxService.set(String(ctx.chatId), { mode: 'SERVICE_REQUEST', serviceRequestId: result.request.id }, 'max');
        await this.replyServiceRequestStep(ctx, result);
    }

    private async confirmServiceRequest(ctx: any, requestId: number) {
        if (!requestId) return;

        const result = await this.serviceRequestsService.confirmPrice(this.toClientIdentity(ctx), requestId);
        await this.ctxService.set(String(ctx.chatId), { mode: 'IDLE', serviceRequestId: null }, 'max');
        await ctx.reply(`Заявка #${result.request.id} отправлена оператору. Оператор подготовит счет и пришлет его вам.`);
        await this.sendMainMenu(ctx);
    }

    private async replyServiceRequestStep(ctx: any, result: ReturnType<ServiceRequestsService['present']>) {
        if (result.nextStep) {
            if (result.nextStep.options?.length) {
                await ctx.reply(`${result.nextStep.label}:`, {
                    attachments: [
                        Keyboard.inlineKeyboard(
                            result.nextStep.options.map((option) => [
                                Keyboard.button.callback(option.label, `serviceRequestAnswer:${result.request.id}:${option.value}`),
                            ]),
                        ),
                    ],
                });
                return;
            }

            await ctx.reply(`${result.nextStep.label}:`);
            return;
        }

        if (!result.isReadyForConfirmation) {
            await this.finishServiceRequest(ctx);
            return;
        }

        const priceText = result.request.calculatedPrice
            ? `${result.request.calculatedPrice} руб.`
            : 'стоимость уточнит оператор';
        await ctx.reply(`Стоимость замены ФН: ${priceText}\n\nЕсли все верно, подтвердите заказ счета.`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('Согласен, заказать счет', `serviceRequestConfirm:${result.request.id}`)],
                ]),
            ],
        });
    }

    private async startTicket(ctx: any) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.openTicket(this.toClientIdentity(ctx));

        if (result.status === 'already_open') {
            await ctx.reply('У вас уже есть вопрос в работе. Ожидайте ответа оператора.');
            await this.sendMainMenu(ctx);
            return;
        }

        await this.ctxService.set(chatId, { mode: 'TICKET' }, 'max');
        await ctx.reply('Введите текст вопроса для оператора:');
    }

    private async handleTicketText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const result = await this.clientWorkflow.submitTicketMessage(this.toClientIdentity(ctx), text);

        if (result.status === 'not_found') {
            await ctx.reply('Вопрос не найден. Создайте новый из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');

        await ctx.reply('Ваш вопрос принят. Оператор ответит в ближайшее время.');
        await this.sendMainMenu(ctx);
    }

    private extractMaxMedia(ctx: any): TicketMediaInput | null {
        const attachment = ctx.message?.body?.attachments?.find((item: any) =>
            item?.type === 'image' || item?.type === 'video' || item?.type === 'audio' || item?.type === 'file'
        );
        if (!attachment) return null;

        const messageType = attachment.type === 'image'
            ? 'image'
            : attachment.type === 'file'
                ? 'document'
                : attachment.type;

        return {
            messageType,
            text: ctx.message?.body?.text || undefined,
            fileId: attachment.payload?.token,
            fileName: attachment.filename,
            fileSize: attachment.size,
            externalUrl: attachment.payload?.url,
        };
    }

    private async handleMaxMedia(ctx: any, mode: string, media: TicketMediaInput) {
        const chatId = String(ctx.chatId);

        if (mode === 'TICKET') {
            await this.clientWorkflow.submitTicketMedia(this.toClientIdentity(ctx), media);
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await ctx.reply('Вложение принято, оператор ответит в ближайшее время.');
            await this.sendMainMenu(ctx);
            return;
        }

        if (mode === 'REGISTER') {
            const result = await this.clientWorkflow.submitRegistrationPhoto(this.toClientIdentity(ctx), {
                buffer: await this.downloadMediaBuffer(media),
                fileName: media.fileName || `${media.messageType}.jpg`,
            });
            if (result.status === 'completed') {
                await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
                await ctx.reply('Анкета заполнена, оператор свяжется с вами в ближайшее время.');
                await this.sendMainMenu(ctx);
                return;
            }
            await ctx.reply(result.nextField ? `${result.nextField}:` : 'Фото принято.');
            return;
        }

        if (mode === 'ATOL_CONSENT') {
            const result = await this.clientWorkflow.submitAtolConsentSignedFile(this.toClientIdentity(ctx), {
                buffer: await this.downloadMediaBuffer(media),
                fileName: media.fileName || `${media.messageType}.jpg`,
            });
            if (result.status === 'not_found') {
                await ctx.reply('Сначала сформируйте согласие через меню сервиса.');
                await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
                await this.sendMainMenu(ctx);
                return;
            }

            await ctx.reply('Спасибо, подписанное согласие получено. Оператор проверит документ и продолжит работу.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        if (mode === 'IDLE') {
            const activeTicket = await this.ticketService.getActiveTicket(chatId, 'max');
            if (activeTicket?.text) {
                await this.clientWorkflow.submitTicketMedia(this.toClientIdentity(ctx), media);
                await ctx.reply('Вложение добавлено к вашему открытому вопросу.');
                return;
            }
        }

        if (mode !== 'OPERATOR') {
            await ctx.reply('Выберите действие из меню.');
            await this.sendMainMenu(ctx);
            return;
        }

        const talkingToId = await this.usersService.getTalkingTo(chatId, 'max');
        if (!talkingToId) return;

        const activeTicket = await this.ticketService.getActiveTicket(talkingToId, 'max');
        if (activeTicket) {
            await this.ticketService.addMediaMessage(activeTicket.id, 'operator', media, chatId, 'bot');
        }

        await this.messengerService.sendMessage(
            talkingToId,
            `Оператор отправил вложение: ${media.fileName || media.externalUrl || media.messageType}`,
            { inlineKeyboard: disconnectFromKeyboard(chatId), platform: 'max' },
        );
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

    private async connectToClient(ctx: any, clientChatId?: string) {
        const operatorChatId = String(ctx.chatId);
        if (!operatorChatId || !clientChatId) return;

        if (!(await this.usersService.isOperator(operatorChatId, 'max'))) {
            await ctx.reply('Недостаточно прав');
            return;
        }

        if (await this.usersService.isAlreadyTalking(clientChatId, 'max')) {
            await ctx.reply('К чату с этим клиентом уже подключен оператор');
            return;
        }

        await this.ctxService.set(clientChatId, { mode: 'OPERATOR' }, 'max');
        await this.ctxService.set(operatorChatId, { mode: 'OPERATOR' }, 'max');
        await this.usersService.setTalkingTo(operatorChatId, clientChatId, 'max');

        await this.messengerService.sendMessage(
            clientChatId,
            'К чату с вами присоединился оператор, он будет видеть все ваши сообщения.',
            { inlineKeyboard: disconnectFromKeyboard(operatorChatId), platform: 'max' },
        );
        await ctx.reply('Вы подключены к чату с клиентом, все ваши сообщения будут отправлены клиенту.');
    }

    private async disconnectFromClient(ctx: any, talkingToChatId?: string) {
        const initChatId = String(ctx.chatId);
        if (!initChatId || !talkingToChatId) return;

        const isTalking = await this.usersService.isTalking(initChatId, talkingToChatId, 'max');
        if (!isTalking) {
            await ctx.reply('Диалог уже завершен или недоступен');
            return;
        }

        let operatorChatId: string;
        let clientChatId: string;
        if (await this.usersService.isOperator(initChatId, 'max')) {
            operatorChatId = initChatId;
            clientChatId = talkingToChatId;
        } else {
            operatorChatId = talkingToChatId;
            clientChatId = initChatId;
        }

        const closedTicket = await this.ticketService.getActiveTicket(clientChatId, 'max');
        if (!closedTicket) {
            await ctx.reply('Этот вопрос больше недоступен, скорее всего, он уже был закрыт ранее');
            return;
        }

        await this.ticketService.closeTicket(closedTicket.id, operatorChatId);
        await this.ctxService.set(clientChatId, { mode: 'IDLE' }, 'max');
        await this.ctxService.set(operatorChatId, { mode: 'IDLE' }, 'max');
        await this.usersService.stopDialog(operatorChatId, clientChatId, 'max');

        await this.messengerService.sendMessage(clientChatId, 'Оператор отключился от чата с вами.', { platform: 'max' });
        await this.messengerService.sendMessage(operatorChatId, 'Вы отключились от чата с клиентом.', { platform: 'max' });
    }

    private async forwardOperatorText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const talkingToId = await this.usersService.getTalkingTo(chatId, 'max');
        if (!talkingToId) {
            await ctx.reply('К вам сейчас не подключен оператор');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        await this.messengerService.sendMessage(
            talkingToId,
            text,
            { inlineKeyboard: disconnectFromKeyboard(chatId), platform: 'max' },
        );
    }

    private isSimpleServiceRequestCode(value: string): value is SimpleServiceRequestCode {
        return value === 'firmware_update' || value === 'kkt_remote_work';
    }
}
