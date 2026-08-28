import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { POSTGRES_INTEGER_MAX } from './order.types';
import { OrdersService } from './orders.service';

type OrderUploadRequest = Request & {
    admin?: AdminPrincipal;
    webSession?: WebSessionPrincipal;
    params: { id?: string };
};

@Injectable()
export class OrderInvoiceUploadPreflightGuard implements CanActivate {
    constructor(private readonly orders: OrdersService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<OrderUploadRequest>();
        const actor = request.admin;
        if (!actor) throw new NotFoundException('Order was not found');
        await this.orders.preflightInvoiceUpload(
            parseOrderId(request.params.id),
            actor,
        );
        return true;
    }
}

@Injectable()
export class OrderPaymentProofUploadPreflightGuard implements CanActivate {
    constructor(private readonly orders: OrdersService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<OrderUploadRequest>();
        const session = request.webSession;
        if (!session) throw new NotFoundException('Order was not found');
        await this.orders.preflightPaymentProofUpload(
            parseOrderId(request.params.id),
            session.userId,
        );
        return true;
    }
}

function parseOrderId(value?: string) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || id > POSTGRES_INTEGER_MAX) {
        throw new NotFoundException('Order was not found');
    }
    return id;
}
