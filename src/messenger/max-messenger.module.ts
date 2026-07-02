import { Module } from '@nestjs/common';
import { MESSENGER_SERVICE } from './messenger.types';
import { MaxMessengerService } from './max-messenger.service';

@Module({
    providers: [
        MaxMessengerService,
        {
            provide: MESSENGER_SERVICE,
            useExisting: MaxMessengerService,
        },
    ],
    exports: [MESSENGER_SERVICE, MaxMessengerService],
})
export class MaxMessengerModule { }
