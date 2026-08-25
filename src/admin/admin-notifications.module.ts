import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/audit/audit.module';
import { OutboundDeliveriesModule } from 'src/outbound-deliveries/outbound-deliveries.module';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminNotificationsService } from './admin-notifications.service';
import { MessengerAdminAccessService } from './messenger-admin-access.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([AdminUserEntity]),
        OutboundDeliveriesModule,
        AuditModule,
    ],
    providers: [AdminNotificationsService, MessengerAdminAccessService],
    exports: [AdminNotificationsService, MessengerAdminAccessService],
})
export class AdminNotificationsModule {}
