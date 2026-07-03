import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { UsersService } from 'src/users/users.service';
import { formatTicket } from 'src/common/utils';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { connectToKeyboard } from 'src/messenger/messenger-keyboards';
import { UserPlatform } from 'src/users/entities/user.entity';

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,
        @InjectRepository(TicketMessageEntity)
        private readonly messagesRepo: Repository<TicketMessageEntity>,

        private usersService: UsersService,
        @Inject(MESSENGER_SERVICE)
        private messengerService: MessengerService
    ) { }

    async createTicket(
        userChatId: string,
        username?: string,
        name?: string,
        text?: string,
        platform: UserPlatform = 'telegram',
    ) {
        const ticket = this.ticketRepo.create({
            userChatId,
            platform,
            username: username,
            name: name,
            text: text
        });
        const savedTicket = await this.ticketRepo.save(ticket);

        if (text?.trim()) {
            await this.addMessage(savedTicket.id, 'user', text.trim(), userChatId, 'bot');
        }

        return savedTicket;
    }

    async getActiveTicket(chatId: string, platform: UserPlatform = 'telegram') {
        return this.ticketRepo.findOne({
            where: {
                userChatId: chatId,
                platform,
                isAnswered: false,
            },
            order: { createdAt: 'DESC' },
        });
    }

    async closeTicket(ticketId: number, operatorChatId: string) {
        await this.ticketRepo.update(ticketId, {
            isAnswered: true,
            answeredBy: operatorChatId,
        });

        return this.ticketRepo.findOne({ where: { id: ticketId } });
    }

    async getTicketById(id: number) {
        return this.ticketRepo.findOne({ where: { id } });
    }

    async saveTicketText(chatId: string, value: string, platform: UserPlatform = 'telegram') {
        const ticket = await this.getActiveTicket(chatId, platform);
        if (!ticket) return null;

        ticket.text = value

        await this.ticketRepo.save(ticket);
        await this.addMessage(ticket.id, 'user', value, chatId, 'bot');

        return ticket
    }

    getTicketMessages(ticketId: number) {
        return this.messagesRepo.find({
            where: { ticketId },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
    }

    async addMessage(
        ticketId: number,
        sender: 'user' | 'operator',
        text: string,
        authorId: string | null,
        source: 'bot' | 'admin-panel' = 'bot',
    ) {
        const message = this.messagesRepo.create({
            ticketId,
            sender,
            text,
            authorId,
            source,
        });

        return this.messagesRepo.save(message);
    }

    async getActualTickets() {
        return this.ticketRepo.find({
            where: { isAnswered: false },
            order: { createdAt: 'ASC' },
        });
    }

    async notifyOperatorsAboutNewTicket(ticket: TicketEntity) {
        const operators = await this.usersService.getOperators(ticket.platform);

        const message = formatTicket(ticket);

        for (const op of operators) {
            await this.messengerService.sendMessage(
                op.chatId,
                message,
                { inlineKeyboard: connectToKeyboard(ticket.userChatId), platform: op.platform }
            );
        }
    }
}

