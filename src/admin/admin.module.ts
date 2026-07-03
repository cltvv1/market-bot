import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidEntity } from 'src/bids/entities/bid.entity';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([RegistrationRequestEntity, BidEntity, TicketEntity]),
        MessengerModule,
    ],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
