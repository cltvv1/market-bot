import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,
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
}

