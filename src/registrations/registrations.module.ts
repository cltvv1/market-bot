import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

import { PdfModule } from 'src/pdf/pdf.module';
import { UsersModule } from 'src/users/users.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { AdminNotificationsModule } from 'src/admin/admin-notifications.module';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationRequestEntity, RegistrationFieldEntity]), PdfModule, UsersModule, MessengerModule, AdminNotificationsModule],
    providers: [RegistrationsService],
    exports: [RegistrationsService],
})
export class RegistrationsModule { }
