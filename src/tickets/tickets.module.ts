import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TicketEntity } from './entities/ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { TicketsService } from './tickets.service';
import { UsersModule } from 'src/users/users.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminNotificationsModule } from 'src/admin/admin-notifications.module';
import { FilesModule } from 'src/files/files.module';
import { OutboundDeliveriesModule } from 'src/outbound-deliveries/outbound-deliveries.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([TicketEntity, TicketMessageEntity]),
        UsersModule,
        MessengerModule,
        AdminNotificationsModule,
        FilesModule,
        OutboundDeliveriesModule,
    ],
    providers: [TicketsService],
    exports: [TicketsService],
})
export class TicketsModule {}
