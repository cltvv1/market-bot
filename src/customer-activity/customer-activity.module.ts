import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerActivityEntity } from './entities/customer-activity.entity';
import { CustomerActivityService } from './customer-activity.service';

@Module({
    imports: [TypeOrmModule.forFeature([CustomerActivityEntity])],
    providers: [CustomerActivityService],
    exports: [CustomerActivityService, TypeOrmModule],
})
export class CustomerActivityModule { }
