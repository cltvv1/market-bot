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

    /** Создание тикета при первом тексте */
    async createTicket(data: {
        userChatId: string;
        username?: string;
        name?: string;
        text: string;
    }) {
        const ticket = this.ticketRepo.create({
            ...data,
        });
        return this.ticketRepo.save(ticket);
    }

    /** Получить незакрытый тикет пользователя */
    async getActiveTicket(chatId: string) {
        return this.ticketRepo.findOne({
            where: {
                userChatId: chatId,
                isAnswered: false,
            },
            order: { createdAt: 'DESC' },
        });
    }

    /** Закрыть тикет */
    async closeTicket(ticketId: number, operatorChatId: string) {
        await this.ticketRepo.update(ticketId, {
            isAnswered: true,
            answeredBy: operatorChatId,
        });

        return this.ticketRepo.findOne({ where: { id: ticketId } });
    }

    /** Получить тикет по ID */
    async getById(id: number) {
        return this.ticketRepo.findOne({ where: { id } });
    }
}
