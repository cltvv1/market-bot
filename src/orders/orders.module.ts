import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from 'src/admin/admin.module';
import { AuditModule } from 'src/audit/audit.module';
import { CatalogModule } from 'src/catalog/catalog.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { WebSessionModule } from 'src/web-session/web-session.module';
import { AdminOrdersController } from './admin-orders.controller';
import { ClientOrdersController } from './client-orders.controller';
import { OrderEventEntity } from './entities/order-event.entity';
import { OrderLineEntity } from './entities/order-line.entity';
import { OrderEntity } from './entities/order.entity';
import { OrdersService } from './orders.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrderEntity,
            OrderLineEntity,
            OrderEventEntity,
        ]),
        AdminModule,
        AuditModule,
        CatalogModule,
        OrganizationsModule,
        WebSessionModule,
    ],
    controllers: [ClientOrdersController, AdminOrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule {}
