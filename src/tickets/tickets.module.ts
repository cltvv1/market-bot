import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TicketEntity } from './entities/ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { TicketsService } from './tickets.service';
import { UsersModule } from 'src/users/users.module';
import { MessengerModule } from 'src/messenger/messenger.module';

@Module({
    imports: [TypeOrmModule.forFeature([TicketEntity, TicketMessageEntity]), UsersModule, MessengerModule],
    providers: [TicketsService],
    exports: [TicketsService],
})
export class TicketsModule { }
