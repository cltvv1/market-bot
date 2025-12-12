import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { UsersModule } from 'src/users/users.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserContextService } from 'src/userContext/user-context.service';
import { RegistrationsModule } from 'src/registrations/registrations.module';


@Module({
    imports: [
        RegistrationsModule,
        TicketsModule,
        UsersModule
    ],
    providers: [TelegramUpdate, UserContextService],
})
export class TelegramModule { }
