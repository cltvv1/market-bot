import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'src/files/files.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { ServiceRequestEntity } from 'src/service-requests/entities/service-request.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { OutboundDeliveryEntity } from './entities/outbound-delivery.entity';
import { OutboundDeliveryProcessor } from './outbound-delivery.processor';
import { OutboundDeliveriesService } from './outbound-deliveries.service';
import { StaffNotificationAuthorizationService } from './staff-notification-authorization.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OutboundDeliveryEntity,
            AdminUserEntity,
            RegistrationRequestEntity,
            ServiceRequestEntity,
            TicketEntity,
        ]),
        FilesModule,
        MessengerModule,
    ],
    providers: [
        OutboundDeliveriesService,
        OutboundDeliveryProcessor,
        StaffNotificationAuthorizationService,
    ],
    exports: [
        OutboundDeliveriesService,
        OutboundDeliveryProcessor,
        StaffNotificationAuthorizationService,
    ],
})
export class OutboundDeliveriesModule {}
