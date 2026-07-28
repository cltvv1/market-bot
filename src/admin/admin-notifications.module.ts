import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminNotificationsService } from './admin-notifications.service';

@Module({
    imports: [TypeOrmModule.forFeature([AdminUserEntity]), MessengerModule],
    providers: [AdminNotificationsService],
    exports: [AdminNotificationsService],
})
export class AdminNotificationsModule { }
