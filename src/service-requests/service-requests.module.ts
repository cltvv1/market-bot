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
import { ServiceRequestAdminReadService } from './service-request-admin-read.service';
import { ServiceRequestAdminCommandsService } from './service-request-admin-commands.service';
import { ServiceRequestChannelWorkflowService } from './service-request-channel-workflow.service';
import { FilesModule } from 'src/files/files.module';
import { AuditModule } from 'src/audit/audit.module';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { ServiceFormDefinitionEntity } from './entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import { ServiceRequestMessageEntity } from './entities/service-request-message.entity';
import { ServiceFormService } from './service-form.service';
import { PublicServiceRequestsController } from './public-service-requests.controller';
import { OutboundDeliveriesModule } from 'src/outbound-deliveries/outbound-deliveries.module';
import {
    DraftServiceRequestUploadGuard,
    MessageServiceRequestUploadGuard,
    PublicServiceRequestUploadGuard,
} from './service-request-upload.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ServiceTypeEntity,
            ServiceRequestEntity,
            ServiceRequestEventEntity,
            ServiceFormDefinitionEntity,
            ServiceFormVersionEntity,
            ServiceRequestAttachmentEntity,
            ServiceRequestMessageEntity,
            CashRegisterEntity,
        ]),
        UsersModule,
        OrganizationsModule,
        CustomerActivityModule,
        MessengerModule,
        AdminNotificationsModule,
        PdfModule,
        FilesModule,
        AuditModule,
        OutboundDeliveriesModule,
    ],
    controllers: [ServiceRequestsController, PublicServiceRequestsController],
    providers: [
        ServiceRequestAdminReadService,
        ServiceRequestAdminCommandsService,
        ServiceRequestsService,
        ServiceRequestChannelWorkflowService,
        ServiceFormService,
        DraftServiceRequestUploadGuard,
        MessageServiceRequestUploadGuard,
        PublicServiceRequestUploadGuard,
    ],
    exports: [
        ServiceRequestsService,
        ServiceRequestAdminReadService,
        ServiceRequestAdminCommandsService,
        TypeOrmModule,
    ],
})
export class ServiceRequestsModule implements OnApplicationBootstrap {
    constructor(
        private readonly serviceRequestsService: ServiceRequestsService,
    ) {}

    async onApplicationBootstrap() {
        await this.serviceRequestsService.getTypesWithForms();
    }
}
