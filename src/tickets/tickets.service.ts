import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { UsersService } from 'src/users/users.service';
import { formatTicket } from 'src/common/utils';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { connectToKeyboard } from 'src/messenger/messenger-keyboards';

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,

        private usersService: UsersService,
        @Inject(MESSENGER_SERVICE)
        private messengerService: MessengerService
    ) { }

    async createTicket(
        userChatId: string,
        username?: string,
        name?: string,
        text?: string,
    ) {
        const ticket = this.ticketRepo.create({
            userChatId,
            username: username,
            name: name,
            text: text
        });
        return this.ticketRepo.save(ticket);
    }

    async getActiveTicket(chatId: string) {
        return this.ticketRepo.findOne({
            where: {
                userChatId: chatId,
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

    async saveTicketText(chatId: string, value: string) {
        const ticket = await this.getActiveTicket(chatId);
        if (!ticket) return null;

        ticket.text = value

        await this.ticketRepo.save(ticket);

        return ticket
    }

    async getActualTickets() {
        return this.ticketRepo.find({
            where: { isAnswered: false },
            order: { createdAt: 'ASC' },
        });
    }

    async notifyOperatorsAboutNewTicket(ticket: TicketEntity) {
        const operators = await this.usersService.getOperators('telegram');

        const message = formatTicket(ticket);

        for (const op of operators) {
            await this.messengerService.sendMessage(
                op.chatId,
                message,
                { inlineKeyboard: connectToKeyboard(ticket.userChatId) }
            );
        }
    }
}

