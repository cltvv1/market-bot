import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BidEntity } from './entities/bid.entity';
import { BidService } from './bids.service';
import { BidFieldEntity } from './entities/bid-field.entity';

import { UsersModule } from 'src/users/users.module';
import { TelegramSenderModule } from 'src/telegramSender/telegram-sender.module';

@Module({
    imports: [TypeOrmModule.forFeature([BidEntity, BidFieldEntity]), UsersModule, TelegramSenderModule],
    providers: [BidService],
    exports: [BidService],
})
export class BidsModule { }
