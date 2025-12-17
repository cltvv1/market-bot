import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

import { PdfModule } from 'src/pdf/pdf.module';
import { UsersModule } from 'src/users/users.module';
import { TelegramSenderModule } from 'src/telegramSender/telegram-sender.module';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationRequestEntity, RegistrationFieldEntity]), PdfModule, UsersModule, TelegramSenderModule],
    controllers: [RegistrationsController],
    providers: [RegistrationsService],
    exports: [RegistrationsService],
})
export class RegistrationsModule { }
