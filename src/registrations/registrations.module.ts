import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

import { PdfModule } from 'src/pdf/pdf.module';
import { UsersModule } from 'src/users/users.module';
import { AdminNotificationsModule } from 'src/admin/admin-notifications.module';
import { FilesModule } from 'src/files/files.module';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from './entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from './entities/registration-data-request.entity';
import { EquipmentKitEntity } from 'src/assets/entities/equipment-kit.entity';
import { AuditModule } from 'src/audit/audit.module';
import { RegistrationReadinessService } from './registration-readiness.service';
import { MessengerModule } from 'src/messenger/messenger.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            RegistrationRequestEntity,
            RegistrationFieldEntity,
            RegistrationRequirementEntity,
            RegistrationEvidenceEntity,
            RegistrationDataRequestEntity,
            EquipmentKitEntity,
        ]),
        PdfModule,
        UsersModule,
        MessengerModule,
        AdminNotificationsModule,
        FilesModule,
        AuditModule,
    ],
    providers: [RegistrationsService, RegistrationReadinessService],
    exports: [RegistrationsService, RegistrationReadinessService],
})
export class RegistrationsModule {}
