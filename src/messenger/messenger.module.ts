import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { MESSENGER_SERVICE } from './messenger.types';
import { MaxMessengerService } from './max-messenger.service';
import { MessengerRouterService } from './messenger-router.service';
import { TelegramMessengerService } from './telegram-messenger.service';

@Module({
    imports: [TelegrafModule],
    providers: [
        MaxMessengerService,
        MessengerRouterService,
        TelegramMessengerService,
        {
            provide: MESSENGER_SERVICE,
            useExisting: MessengerRouterService,
        },
    ],
    exports: [MESSENGER_SERVICE],
})
export class MessengerModule { }
