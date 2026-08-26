import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit } from 'src/security/rate-limit';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import {
    ClientOrderListQueryDto,
    OrderIdParamDto,
    SubmitOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('api/client/orders')
@UseGuards(WebSessionGuard)
export class ClientOrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Post()
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-order-submit', 10, 600)
    submit(
        @Body() body: SubmitOrderDto,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @CurrentWebSession() session: WebSessionPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.submit(
            body,
            idempotencyKey,
            session,
            request.requestId,
        );
    }

    @Get()
    @RateLimit('public-sensitive-read', 60, 60)
    list(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Query() query: ClientOrderListQueryDto,
    ) {
        return this.orders.listClient(session.userId, query);
    }

    @Get(':id')
    @RateLimit('public-sensitive-read', 60, 60)
    get(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: OrderIdParamDto,
    ) {
        return this.orders.getClient(session.userId, params.id);
    }
}
