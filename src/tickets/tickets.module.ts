import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TicketEntity } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';

@Module({
    imports: [TypeOrmModule.forFeature([TicketEntity]),],
    providers: [TicketsService],
    exports: [TicketsService],
})
export class TicketsModule { }
