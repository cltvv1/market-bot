import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { BidService } from 'src/bids/bids.service';
import { BidType, bidTypeToText } from 'src/bids/bid.types';
import { RegistrationsService } from 'src/registrations/registrations.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserContextService } from 'src/userContext/user-context.service';
import { UsersService } from 'src/users/users.service';
import { disconnectFromKeyboard } from 'src/messenger/messenger-keyboards';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';

@Injectable()
export class MaxUpdate implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MaxUpdate.name);
    private bot?: Bot;

    constructor(
        private readonly configService: ConfigService,
        private readonly bidService: BidService,
        private readonly regService: RegistrationsService,
        private readonly ticketService: TicketsService,
        private readonly ctxService: UserContextService,
        private readonly usersService: UsersService,
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

        this.bot.action(/^bid:.+/, async (ctx) => {
            const rawType = ctx.callback?.payload?.split(':')[1];
            await ctx.answerOnCallback({ notification: 'Сервисная заявка' });
            await this.startBid(ctx, rawType);
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
            if (!text || text.startsWith('/')) return;

            const chatId = String(ctx.chatId);
            const context = await this.ctxService.get(chatId, 'max');

            if (context.mode === 'REGISTER') {
                await this.handleRegistrationText(ctx, text);
                return;
            }

            if (context.mode === 'BID') {
                await this.handleBidText(ctx, text);
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

        await this.usersService.getOrCreateOrUpdate(
            String(ctx.chatId),
            ctx.user?.name,
            ctx.user?.username ?? undefined,
            'max',
        );
    }

    private async sendMainMenu(ctx: any) {
        await ctx.reply(
            'Я чат-бот компании ВитмаМаркет. Чем могу помочь?',
            {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('Регистрация кассы', 'wantToRegister')],
                        [Keyboard.button.callback('Сервисная заявка: обновление прошивки', 'bid:FIRMWARE_UPDATE')],
                        [Keyboard.button.callback('Сервисная заявка: удаленные работы с ККТ', 'bid:KKT_REMOTE_WORK')],
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
        let reg = await this.regService.getNotFilledReg(chatId, 'max');

        if (!reg) {
            reg = await this.regService.createRegistration(chatId, 'max');
            await ctx.reply('Заявка создана.');
        } else {
            await ctx.reply('Найдена незаполненная заявка. Продолжим с места остановки.');
        }

        await this.ctxService.set(chatId, { mode: 'REGISTER' }, 'max');
        const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep);

        if (!nextFieldText) {
            await ctx.reply('Анкета уже заполнена.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        await ctx.reply(`${nextFieldText}:`);
    }

    private async handleRegistrationText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const reg = await this.regService.saveFieldValue(chatId, text, 'max');

        if (!reg) {
            await ctx.reply('Заявка не найдена. Начните регистрацию из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        const nextFieldText = await this.regService.getFieldTextByStep(reg.currentStep);

        if (nextFieldText) {
            await ctx.reply(`${nextFieldText}:`);
            return;
        }

        const filePath = await this.regService.finishReg(reg);
        await this.regService.notifyAdminsAboutNewReg(reg, filePath);
        await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');

        await ctx.reply(
            'Анкета заполнена. В ближайшее время оператор свяжется с вами по контактному телефону, указанному в заявке.',
        );
        await this.sendMainMenu(ctx);
    }

    private async startBid(ctx: any, rawType?: string) {
        const chatId = String(ctx.chatId);
        let bid = await this.bidService.getNotFilledBid(chatId, 'max');

        if (!bid) {
            if (!rawType || !(rawType in BidType)) {
                await ctx.reply('Неизвестный тип сервисной заявки.');
                await this.sendMainMenu(ctx);
                return;
            }

            const type = BidType[rawType as keyof typeof BidType];
            bid = await this.bidService.createBid(chatId, type, 'max');
            await ctx.reply(`Создана заявка: ${bidTypeToText(type)}.`);
        } else {
            await ctx.reply('Найдена незаполненная сервисная заявка. Продолжим с места остановки.');
        }

        await this.ctxService.set(chatId, { mode: 'BID' }, 'max');
        const nextFieldText = await this.bidService.getFieldTextByStep(bid.currentStep);

        if (!nextFieldText) {
            await this.finishBid(ctx, bid);
            return;
        }

        await ctx.reply(`${nextFieldText}:`);
    }

    private async handleBidText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const bid = await this.bidService.saveFieldValue(chatId, text, 'max');

        if (!bid) {
            await ctx.reply('Сервисная заявка не найдена. Создайте новую из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        const nextFieldText = await this.bidService.getFieldTextByStep(bid.currentStep);

        if (nextFieldText) {
            await ctx.reply(`${nextFieldText}:`);
            return;
        }

        await this.finishBid(ctx, bid);
    }

    private async finishBid(ctx: any, bid: any) {
        await this.bidService.finishBid(bid);
        await this.bidService.notifyAdminsAboutNewBid(bid);
        await this.ctxService.set(String(ctx.chatId), { mode: 'IDLE' }, 'max');

        await ctx.reply('Сервисная заявка создана. Оператор свяжется с вами в ближайшее время.');
        await this.sendMainMenu(ctx);
    }

    private async startTicket(ctx: any) {
        const chatId = String(ctx.chatId);
        const activeTicket = await this.ticketService.getActiveTicket(chatId, 'max');

        if (activeTicket?.text) {
            await ctx.reply('У вас уже есть вопрос в работе. Ожидайте ответа оператора.');
            await this.sendMainMenu(ctx);
            return;
        }

        if (!activeTicket) {
            await this.ticketService.createTicket(
                chatId,
                ctx.user?.username ?? undefined,
                ctx.user?.name,
                undefined,
                'max',
            );
        }

        await this.ctxService.set(chatId, { mode: 'TICKET' }, 'max');
        await ctx.reply('Введите текст вопроса для оператора:');
    }

    private async handleTicketText(ctx: any, text: string) {
        const chatId = String(ctx.chatId);
        const ticket = await this.ticketService.saveTicketText(chatId, text, 'max');

        if (!ticket) {
            await ctx.reply('Вопрос не найден. Создайте новый из главного меню.');
            await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');
            await this.sendMainMenu(ctx);
            return;
        }

        await this.ticketService.notifyOperatorsAboutNewTicket(ticket);
        await this.ctxService.set(chatId, { mode: 'IDLE' }, 'max');

        await ctx.reply('Ваш вопрос принят. Оператор ответит в ближайшее время.');
        await this.sendMainMenu(ctx);
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
}
