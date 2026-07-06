import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationFieldEntity } from 'src/registrations/entities/registration-field.entity';
import { DatabaseSeedService } from './database-seed.service';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationFieldEntity])],
    providers: [DatabaseSeedService],
})
export class DatabaseSeedModule { }
