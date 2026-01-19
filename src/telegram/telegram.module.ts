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


@Module({
    imports: [
        RegistrationsModule,
        TicketsModule,
        UsersModule
    ],
    providers: [TelegramUpdate,
        UserContextService,
        RegisterTextHandler,
        IdleTextHandler,
        TicketTextHandler,
        OperatorTextHandler
    ],
})
export class TelegramModule { }
