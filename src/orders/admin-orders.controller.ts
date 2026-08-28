import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { multipartOptionsForPurpose } from 'src/files/multipart-options';
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
    ConfirmOrderPaymentDto,
    OrderDocumentIdParamDto,
    OrderExpectedVersionDto,
    OrderIdParamDto,
    UpdateOrderQuoteDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import { OrderInvoiceUploadPreflightGuard } from './order-upload-preflight.guard';
import { orderDocumentContentDisposition } from './order-payment';

interface UploadedMemoryFile {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
}

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

    @Post(':id/invoices')
    @RequirePermissions('orders.invoice')
    @UseGuards(OrderInvoiceUploadPreflightGuard)
    @UseInterceptors(
        FileInterceptor('file', multipartOptionsForPurpose('order-invoice', 1)),
    )
    @RateLimit('admin-order-document-upload', 60, 600)
    uploadInvoice(
        @Param() params: OrderIdParamDto,
        @Body() body: OrderExpectedVersionDto,
        @UploadedFile() file: UploadedMemoryFile | undefined,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        if (!file) throw new BadRequestException('File is required');
        return this.orders.uploadInvoice(
            params.id,
            body.expectedVersion,
            file,
            admin,
            request.requestId,
        );
    }

    @Post(':id/confirm-payment')
    @RequirePermissions('orders.payment')
    @RateLimit('admin-order-mutation', 120, 60)
    confirmPayment(
        @Param() params: OrderIdParamDto,
        @Body() body: ConfirmOrderPaymentDto,
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        return this.orders.confirmPayment(
            params.id,
            body,
            admin,
            request.requestId,
        );
    }

    @Get(':id/documents/:documentId/download')
    @RequirePermissions('orders.read.all')
    @RateLimit('admin-order-document-download', 240, 60)
    async downloadDocument(
        @Param() params: OrderDocumentIdParamDto,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.orders.openAdminDocument(
            params.id,
            params.documentId,
        );
        this.sendDocument(response, file, stream);
    }

    private sendDocument(
        response: Response,
        file: { originalName: string; mimeType: string; sizeBytes: string },
        stream: NodeJS.ReadableStream,
    ) {
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Length', file.sizeBytes);
        response.setHeader(
            'Content-Disposition',
            orderDocumentContentDisposition(file.originalName),
        );
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    }
}
