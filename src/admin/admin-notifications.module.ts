import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AuditModule } from 'src/audit/audit.module';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminNotificationsService } from './admin-notifications.service';
import { MessengerAdminAccessService } from './messenger-admin-access.service';

@Module({
    imports: [TypeOrmModule.forFeature([AdminUserEntity]), MessengerModule, AuditModule],
    providers: [AdminNotificationsService, MessengerAdminAccessService],
    exports: [AdminNotificationsService, MessengerAdminAccessService],
})
export class AdminNotificationsModule {}
