import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { MESSENGER_SERVICE } from './messenger.types';
import { TelegramMessengerService } from './telegram-messenger.service';

@Module({
    imports: [TelegrafModule],
    providers: [
        TelegramMessengerService,
        {
            provide: MESSENGER_SERVICE,
            useExisting: TelegramMessengerService,
        },
    ],
    exports: [MESSENGER_SERVICE],
})
export class MessengerModule { }
