import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { CashRegisterEntity } from './entities/cash-register.entity';
import { FiscalDriveEntity } from './entities/fiscal-drive.entity';
import { OfdSubscriptionEntity } from './entities/ofd-subscription.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([CashRegisterEntity, FiscalDriveEntity, OfdSubscriptionEntity]),
        OrganizationsModule,
    ],
    controllers: [AssetsController],
    providers: [AssetsService],
    exports: [AssetsService],
})
export class AssetsModule { }
