import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationRequestEntity } from 'src/registrations/entities/registration.entity';
import { TicketEntity } from 'src/tickets/entities/ticket.entity';
import { TicketMessageEntity } from 'src/tickets/entities/ticket-message.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { CashRegisterEntity } from 'src/assets/entities/cash-register.entity';
import { FiscalDriveEntity } from 'src/assets/entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from 'src/assets/entities/ofd-subscription.entity';
import { EquipmentKitEntity } from 'src/assets/entities/equipment-kit.entity';
import { CustomerActivityEntity } from 'src/customer-activity/entities/customer-activity.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ServiceRequestEntity } from 'src/service-requests/entities/service-request.entity';
import { MessengerModule } from 'src/messenger/messenger.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { AdminSessionEntity } from './entities/admin-session.entity';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminUserRoleEntity } from './entities/admin-user-role.entity';
import { AdminNotificationsModule } from './admin-notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from './admin-auth.guard';
import { FilesModule } from 'src/files/files.module';
import { AuditModule } from 'src/audit/audit.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            RegistrationRequestEntity,
            TicketMessageEntity,
            TicketEntity,
            OrganizationEntity,
            OrganizationMemberEntity,
            CashRegisterEntity,
            FiscalDriveEntity,
            OfdSubscriptionEntity,
            EquipmentKitEntity,
            CustomerActivityEntity,
            UserEntity,
            ServiceRequestEntity,
            AdminUserEntity,
            AdminUserRoleEntity,
            AdminSessionEntity,
        ]),
        MessengerModule,
        ServiceRequestsModule,
        AdminNotificationsModule,
        FilesModule,
        AuditModule,
    ],
    controllers: [AdminController],
    providers: [
        AdminService,
        AdminAuthService,
        AdminSessionGuard,
        AdminPermissionGuard,
    ],
    exports: [AdminAuthService],
})
export class AdminModule { }
