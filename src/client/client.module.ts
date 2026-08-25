import { Module } from '@nestjs/common';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UsersModule } from 'src/users/users.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { CustomerActivityModule } from 'src/customer-activity/customer-activity.module';
import { ClientApiController } from './client-api.controller';
import { ClientWorkflowService } from './client-workflow.service';
import { FilesModule } from 'src/files/files.module';
import { RegistrationEvidenceUploadGuard } from './registration-evidence-upload.guard';

@Module({
    imports: [
        UsersModule,
        RegistrationsModule,
        ServiceRequestsModule,
        TicketsModule,
        OrganizationsModule,
        CustomerActivityModule,
        FilesModule,
    ],
    controllers: [ClientApiController],
    providers: [ClientWorkflowService, RegistrationEvidenceUploadGuard],
    exports: [ClientWorkflowService],
})
export class ClientModule {}
