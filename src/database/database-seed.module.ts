import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidFieldEntity } from 'src/bids/entities/bid-field.entity';
import { RegistrationFieldEntity } from 'src/registrations/entities/registration-field.entity';
import { DatabaseSeedService } from './database-seed.service';

@Module({
    imports: [TypeOrmModule.forFeature([BidFieldEntity, RegistrationFieldEntity])],
    providers: [DatabaseSeedService],
})
export class DatabaseSeedModule { }
