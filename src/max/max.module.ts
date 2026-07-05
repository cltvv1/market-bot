import { Module } from '@nestjs/common';
import { BidsModule } from 'src/bids/bids.module';
import { MaxUpdate } from './max.update';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserContextService } from 'src/userContext/user-context.service';
import { UsersModule } from 'src/users/users.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { ClientModule } from 'src/client/client.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';

@Module({
    imports: [BidsModule, RegistrationsModule, TicketsModule, UsersModule, MessengerModule, ClientModule, ServiceRequestsModule],
    providers: [MaxUpdate, UserContextService],
})
export class MaxModule { }
