import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

import { PdfModule } from 'src/pdf/pdf.module';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationRequestEntity, RegistrationFieldEntity]), PdfModule],
    controllers: [RegistrationsController],
    providers: [RegistrationsService],
    exports: [RegistrationsService],
})
export class RegistrationsModule { }
