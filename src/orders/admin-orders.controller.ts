import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from 'src/admin/admin-auth.decorators';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from 'src/admin/admin-auth.guard';
import { AdminOrderListQueryDto, OrderIdParamDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('admin/api/orders')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
@RequirePermissions('orders.read.all')
export class AdminOrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get()
    list(@Query() query: AdminOrderListQueryDto) {
        return this.orders.listAdmin(query);
    }

    @Get(':id')
    get(@Param() params: OrderIdParamDto) {
        return this.orders.getAdmin(params.id);
    }
}
