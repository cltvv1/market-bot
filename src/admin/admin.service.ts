import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BidEntity } from 'src/bids/entities/bid.entity';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type AdminStatusFilter = 'all' | 'new' | 'processed';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationsRepo: Repository<RegistrationRequestEntity>,
        @InjectRepository(BidEntity)
        private readonly bidsRepo: Repository<BidEntity>,
        @InjectRepository(TicketEntity)
        private readonly ticketsRepo: Repository<TicketEntity>,
        @Inject(MESSENGER_SERVICE)
        private readonly messengerService: MessengerService,
    ) { }

    async getSummary() {
        const [newRegistrations, newBids, openTickets] = await Promise.all([
            this.registrationsRepo.count({ where: { isFilled: true, isProcessed: false } }),
            this.bidsRepo.count({ where: { isFilled: true, isProcessed: false } }),
            this.ticketsRepo.count({ where: { isAnswered: false } }),
        ]);

        return { newRegistrations, newBids, openTickets };
    }

    getRegistrations(status: AdminStatusFilter = 'new', platform?: UserPlatform) {
        return this.registrationsRepo.find({
            where: {
                ...(status === 'new' ? { isFilled: true, isProcessed: false } : {}),
                ...(status === 'processed' ? { isProcessed: true } : {}),
                ...(platform ? { platform } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    getRegistration(id: number) {
        return this.registrationsRepo.findOne({ where: { id } });
    }

    getBids(status: AdminStatusFilter = 'new', platform?: UserPlatform) {
        return this.bidsRepo.find({
            where: {
                ...(status === 'new' ? { isFilled: true, isProcessed: false } : {}),
                ...(status === 'processed' ? { isProcessed: true } : {}),
                ...(platform ? { platform } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    getTickets(status: AdminStatusFilter = 'new', platform?: UserPlatform) {
        return this.ticketsRepo.find({
            where: {
                ...(status === 'new' ? { isAnswered: false } : {}),
                ...(status === 'processed' ? { isAnswered: true } : {}),
                ...(platform ? { platform } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    async processRegistration(id: number) {
        await this.registrationsRepo.update(id, { isProcessed: true });
        return this.registrationsRepo.findOne({ where: { id } });
    }

    async processBid(id: number) {
        await this.bidsRepo.update(id, { isProcessed: true });
        return this.bidsRepo.findOne({ where: { id } });
    }

    async replyToTicket(id: number, text: string, operatorId = 'admin-panel') {
        const ticket = await this.ticketsRepo.findOne({ where: { id } });
        if (!ticket) {
            return null;
        }

        await this.messengerService.sendMessage(ticket.userChatId, text, {
            platform: ticket.platform,
        });

        await this.ticketsRepo.update(id, {
            isAnswered: true,
            answeredBy: operatorId,
        });

        return this.ticketsRepo.findOne({ where: { id } });
    }
}
