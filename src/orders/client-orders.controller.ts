import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
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
import { RateLimit } from 'src/security/rate-limit';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import {
    ClientOrderListQueryDto,
    OrderDocumentIdParamDto,
    OrderExpectedVersionDto,
    OrderIdParamDto,
    SubmitOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import { OrderPaymentProofUploadPreflightGuard } from './order-upload-preflight.guard';
import { orderDocumentContentDisposition } from './order-payment';

interface UploadedMemoryFile {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
}

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

    @Post(':id/payment-proofs')
    @UseGuards(WebMutationOriginGuard, OrderPaymentProofUploadPreflightGuard)
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurpose('order-payment-proof', 1),
        ),
    )
    @RateLimit('public-order-document-upload', 20, 600)
    uploadPaymentProof(
        @Param() params: OrderIdParamDto,
        @Body() body: OrderExpectedVersionDto,
        @UploadedFile() file: UploadedMemoryFile | undefined,
        @CurrentWebSession() session: WebSessionPrincipal,
        @Req() request: Request & { requestId?: string },
    ) {
        if (!file) throw new BadRequestException('File is required');
        return this.orders.uploadPaymentProof(
            params.id,
            body.expectedVersion,
            file,
            session,
            request.requestId,
        );
    }

    @Get(':id/documents/:documentId/download')
    @RateLimit('public-order-document-download', 120, 60)
    async downloadDocument(
        @Param() params: OrderDocumentIdParamDto,
        @CurrentWebSession() session: WebSessionPrincipal,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.orders.openClientDocument(
            session.userId,
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
