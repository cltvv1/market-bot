import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationsService, RegistrationFieldsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationRequestEntity, RegistrationFieldEntity])],
    controllers: [RegistrationsController],
    providers: [RegistrationsService, RegistrationFieldsService],
    exports: [RegistrationsService, RegistrationFieldsService],
})
export class RegistrationsModule { }
