import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { UsersModule } from 'src/users/users.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserContextService } from 'src/userContext/user-context.service';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { RegisterTextHandler } from './handlers/register/register-text.handler';
import { IdleTextHandler } from './handlers/idle/idle-text.handler';
import { TicketTextHandler } from './handlers/ticket/ticket-text.handler';
import { OperatorTextHandler } from './handlers/operator/operator-text.handler';
import { BidTextHandler } from './handlers/bid/bid-text.handler';
import { BidsModule } from 'src/bids/bids.module';


@Module({
    imports: [
        RegistrationsModule,
        TicketsModule,
        UsersModule,
        BidsModule
    ],
    providers: [TelegramUpdate,
        UserContextService,
        RegisterTextHandler,
        IdleTextHandler,
        TicketTextHandler,
        OperatorTextHandler,
        BidTextHandler
    ],
})
export class TelegramModule { }
