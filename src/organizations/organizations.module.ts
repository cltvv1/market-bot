import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { OrganizationMemberEntity } from './entities/organization-member.entity';
import { OrganizationEntity } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationAccessRequestEntity } from './entities/organization-access-request.entity';
import { OrganizationAccessService } from './organization-access.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([OrganizationEntity, OrganizationMemberEntity, OrganizationAccessRequestEntity]),
        UsersModule,
        AuditModule,
    ],
    controllers: [OrganizationsController],
    providers: [OrganizationsService, OrganizationAccessService],
    exports: [OrganizationsService, OrganizationAccessService],
})
export class OrganizationsModule { }
