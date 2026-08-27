import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
    CurrentAdmin,
    RequirePermissions,
} from 'src/admin/admin-auth.decorators';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from 'src/admin/admin-auth.guard';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { RateLimit } from 'src/security/rate-limit';
import {
    AdminOrderListQueryDto,
    AssignOrderDto,
    OrderExpectedVersionDto,
    OrderIdParamDto,
    UpdateOrderQuoteDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('admin/api/orders')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminOrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get()
    @RequirePermissions('orders.read.all')
    list(
        @Query() query: AdminOrderListQueryDto,
        @CurrentAdmin() admin: AdminPrincipal,
    ) {
        return this.orders.listAdmin(query, admin);
    }

    @Get(':id')
    @RequirePermissions('orders.read.all')
    get(@Param() params: OrderIdParamDto) {
        return this.orders.getAdmin(params.id);
    }

    @Post(':id/assign')
    @RequirePermissions('orders.assign')
    @RateLimit('admin-order-mutation', 120, 60)
    assign(
        @Param() params: OrderIdParamDto,
        @Body() body: AssignOrderDto,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.assign(params.id, body, admin, request.requestId);
    }

    @Post(':id/start-review')
    @RequirePermissions('orders.review')
    @RateLimit('admin-order-mutation', 120, 60)
    startReview(
        @Param() params: OrderIdParamDto,
        @Body() body: OrderExpectedVersionDto,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.startReview(
            params.id,
            body,
            admin,
            request.requestId,
        );
    }

    @Put(':id/quote')
    @RequirePermissions('orders.quote')
    @RateLimit('admin-order-mutation', 120, 60)
    updateQuote(
        @Param() params: OrderIdParamDto,
        @Body() body: UpdateOrderQuoteDto,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.updateQuote(
            params.id,
            body,
            admin,
            request.requestId,
        );
    }

    @Post(':id/confirm')
    @RequirePermissions('orders.confirm')
    @RateLimit('admin-order-mutation', 120, 60)
    confirm(
        @Param() params: OrderIdParamDto,
        @Body() body: OrderExpectedVersionDto,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.confirm(params.id, body, admin, request.requestId);
    }
}
