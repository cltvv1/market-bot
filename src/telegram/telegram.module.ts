import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { UserContextService } from 'src/userContext/user-context.service';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UsersModule } from 'src/users/users.module';

import { PdfModule } from 'src/pdf/pdf.module';

@Module({
    imports: [
        TelegrafModule.forRoot({
            token: '8364484557:AAHKUVZyWzxu1rPWjDi_I5xtrxBrlD0whls',
        }),
        RegistrationsModule,
        TicketsModule,
        UsersModule
    ],
    providers: [TelegramUpdate, UserContextService],
})
export class TelegramModule { }
