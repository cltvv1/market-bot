import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerActivityModule } from 'src/customer-activity/customer-activity.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { UsersModule } from 'src/users/users.module';
import { AtolConsentEntity } from './entities/atol-consent.entity';
import { AtolConsentsService } from './atol-consents.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([AtolConsentEntity]),
        UsersModule,
        OrganizationsModule,
        CustomerActivityModule,
        PdfModule,
        ServiceRequestsModule,
    ],
    providers: [AtolConsentsService],
    exports: [AtolConsentsService],
})
export class AtolConsentsModule { }
