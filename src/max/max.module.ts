import { Module } from '@nestjs/common';
import { BidsModule } from 'src/bids/bids.module';
import { MaxUpdate } from './max.update';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserContextService } from 'src/userContext/user-context.service';
import { UsersModule } from 'src/users/users.module';

@Module({
    imports: [BidsModule, RegistrationsModule, TicketsModule, UsersModule],
    providers: [MaxUpdate, UserContextService],
})
export class MaxModule { }
