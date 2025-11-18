import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { UserContextService } from 'src/UserContext/user-context.service';

@Module({
    imports: [
        TelegrafModule.forRoot({
            token: '8364484557:AAHLoYQLKbp-581JlNr23hakNi2f6JFPu88',
        }),
        RegistrationsModule
    ],
    providers: [TelegramUpdate, UserContextService],
})
export class TelegramModule { }
