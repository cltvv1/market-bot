import { Module } from '@nestjs/common';
import { BidsModule } from 'src/bids/bids.module';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UsersModule } from 'src/users/users.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { CustomerActivityModule } from 'src/customer-activity/customer-activity.module';
import { ClientApiController } from './client-api.controller';
import { ClientWorkflowService } from './client-workflow.service';

@Module({
    imports: [
        UsersModule,
        RegistrationsModule,
        BidsModule,
        TicketsModule,
        OrganizationsModule,
        CustomerActivityModule,
    ],
    controllers: [ClientApiController],
    providers: [ClientWorkflowService],
    exports: [ClientWorkflowService],
})
export class ClientModule { }
