import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerActivityModule } from 'src/customer-activity/customer-activity.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminNotificationsModule } from 'src/admin/admin-notifications.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { UsersModule } from 'src/users/users.module';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';
import { FilesModule } from 'src/files/files.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServiceTypeEntity, ServiceRequestEntity, ServiceRequestEventEntity]),
        UsersModule,
        OrganizationsModule,
        CustomerActivityModule,
        MessengerModule,
        AdminNotificationsModule,
        PdfModule,
        FilesModule,
    ],
    controllers: [ServiceRequestsController],
    providers: [ServiceRequestsService],
    exports: [ServiceRequestsService, TypeOrmModule],
})
export class ServiceRequestsModule implements OnApplicationBootstrap {
    constructor(private readonly serviceRequestsService: ServiceRequestsService) { }

    async onApplicationBootstrap() {
        await this.serviceRequestsService.ensureDefaultTypes();
    }
}
