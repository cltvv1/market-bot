import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TicketEntity } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { UsersModule } from 'src/users/users.module';
import { TelegramSenderModule } from 'src/telegramSender/telegram-sender.module';

@Module({
    imports: [TypeOrmModule.forFeature([TicketEntity]), UsersModule, TelegramSenderModule],
    providers: [TicketsService],
    exports: [TicketsService],
})
export class TicketsModule { }
