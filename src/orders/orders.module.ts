import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from 'src/admin/admin.module';
import { AuditModule } from 'src/audit/audit.module';
import { CatalogModule } from 'src/catalog/catalog.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { WebSessionModule } from 'src/web-session/web-session.module';
import { FilesModule } from 'src/files/files.module';
import { AdminOrdersController } from './admin-orders.controller';
import { ClientOrdersController } from './client-orders.controller';
import { OrderEventEntity } from './entities/order-event.entity';
import { OrderLineEntity } from './entities/order-line.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderQuoteEntity } from './entities/order-quote.entity';
import { OrderQuoteLineEntity } from './entities/order-quote-line.entity';
import { OrderDocumentEntity } from './entities/order-document.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from 'src/admin/entities/admin-user-role.entity';
import { OrdersService } from './orders.service';
import {
    OrderInvoiceUploadPreflightGuard,
    OrderPaymentProofUploadPreflightGuard,
} from './order-upload-preflight.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrderEntity,
            OrderLineEntity,
            OrderEventEntity,
            OrderQuoteEntity,
            OrderQuoteLineEntity,
            OrderDocumentEntity,
            AdminUserEntity,
            AdminUserRoleEntity,
        ]),
        AdminModule,
        AuditModule,
        CatalogModule,
        FilesModule,
        OrganizationsModule,
        WebSessionModule,
    ],
    controllers: [ClientOrdersController, AdminOrdersController],
    providers: [
        OrdersService,
        OrderInvoiceUploadPreflightGuard,
        OrderPaymentProofUploadPreflightGuard,
    ],
    exports: [OrdersService],
})
export class OrdersModule {}
