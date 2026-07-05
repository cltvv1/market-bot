import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidEntity } from 'src/bids/entities/bid.entity';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { TicketMessageEntity } from 'src/tickets/entities/ticket-message.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { CustomerActivityEntity } from 'src/customer-activity/entities/customer-activity.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { MessengerModule } from 'src/messenger/messenger.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            RegistrationRequestEntity,
            BidEntity,
            TicketMessageEntity,
            TicketEntity,
            OrganizationEntity,
            OrganizationMemberEntity,
            CashRegisterEntity,
            FiscalDriveEntity,
            OfdSubscriptionEntity,
            CustomerActivityEntity,
            UserEntity,
        ]),
        MessengerModule,
        ServiceRequestsModule,
    ],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
