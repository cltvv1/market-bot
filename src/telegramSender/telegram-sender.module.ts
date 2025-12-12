import { Module } from '@nestjs/common';
import { TelegramSenderService } from './telegram-sender.service';
import { TelegrafModule } from 'nestjs-telegraf';

@Module({
    imports: [TelegrafModule],
    providers: [TelegramSenderService],
    exports: [TelegramSenderService],
})
export class TelegramSenderModule { }
