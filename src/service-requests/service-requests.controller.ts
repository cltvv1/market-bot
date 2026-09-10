import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { multipartOptionsForPurpose } from 'src/files/multipart-options';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientIdParamDto } from 'src/client/dto/client-api.dto';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import { ServiceRequestPaymentProofService } from './service-request-payment-proof.service';
import { PaymentProofServiceRequestUploadGuard } from './service-request-payment-proof-upload.guard';
import { paymentProofContentDisposition } from './service-request-payment-proof';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestsService } from './service-requests.service';
import { RateLimit } from 'src/security/rate-limit';
import {
    CreateServiceRequestDraftDto,
    ServiceRequestMessageDto,
    ServiceRequestPaymentProofDto,
    SubmitServiceRequestDto,
    UpdateServiceRequestDraftDto,
} from './dto/canonical-service-request.dto';
import {
    DraftServiceRequestUploadGuard,
    MessageServiceRequestUploadGuard,
} from './service-request-upload.guard';

@Controller('api/client/service-requests')
@ApiTags('service-requests')
@ApiCookieAuth('webSession')
@UseGuards(WebSessionGuard)
export class ServiceRequestsController {
    constructor(
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly paymentProofs: ServiceRequestPaymentProofService,
    ) {}

    @Get('types')
    @ApiOperation({
        summary: 'List active service types and published form versions',
    })
    @RateLimit('public-read', 120, 60)
    getTypes() {
        return this.serviceRequestsService.getTypesWithForms();
    }

    @Get()
    @ApiOperation({
        summary: 'List service requests owned by the current web session',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    getClientRequests(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.serviceRequestsService.listForWeb(session);
    }

    @Post('drafts')
    @ApiOperation({
        summary: 'Create or resume a server-side service request draft',
    })
    @RateLimit('public-form', 30, 600)
    createDraft(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: CreateServiceRequestDraftDto,
    ) {
        return this.serviceRequestsService.createWebDraft(session, body);
    }

    @Patch('drafts/:id')
    @ApiOperation({ summary: 'Partially update structured draft answers' })
    @RateLimit('public-form', 60, 600)
    updateDraft(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: UpdateServiceRequestDraftDto,
    ) {
        return this.serviceRequestsService.updateWebDraft(
            session,
            Number(params.id),
            body.answers,
            body.expectedVersion,
        );
    }

    @Post('drafts/:id/submit')
    @ApiOperation({ summary: 'Validate and idempotently submit a draft' })
    @RateLimit('public-form', 20, 600)
    submitDraft(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: SubmitServiceRequestDto,
    ) {
        return this.serviceRequestsService.submitWebDraft(
            session,
            Number(params.id),
            body.expectedVersion,
            body.idempotencyKey,
        );
    }

    @Post('drafts/:id/attachments')
    @ApiOperation({ summary: 'Upload a validated draft attachment' })
    @UseGuards(DraftServiceRequestUploadGuard)
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurpose('service-attachment'),
        ),
    )
    @RateLimit('public-form', 20, 600)
    addAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.serviceRequestsService.addWebAttachment(
            session,
            Number(params.id),
            {
                buffer: file.buffer,
                originalName: file.originalname,
                mimeType: file.mimetype,
            },
        );
    }

    @Delete('drafts/:id/attachments/:attachmentId')
    @ApiOperation({ summary: 'Remove an attachment before submit' })
    @RateLimit('public-form', 30, 600)
    removeAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
    ) {
        return this.serviceRequestsService.removeWebAttachment(
            session,
            Number(id),
            Number(attachmentId),
        );
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Read a request owned by the current web session',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    getRequest(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
    ) {
        return this.serviceRequestsService.getForWeb(
            session,
            Number(params.id),
        );
    }

    @Post(':id/payment-proof')
    @ApiOperation({
        summary:
            'Upload or replace the owned current payment proof; payment remains unconfirmed',
    })
    @UseGuards(WebMutationOriginGuard, PaymentProofServiceRequestUploadGuard)
    @UseInterceptors(
        FileInterceptor('file', multipartOptionsForPurpose('payment-proof', 1)),
    )
    @RateLimit('public-payment-proof', 10, 600)
    uploadPaymentProof(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ServiceRequestPaymentProofDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file)
            throw new BadRequestException('Payment proof file is required');
        return this.paymentProofs.attachForWeb(
            session,
            Number(params.id),
            body.expectedVersion,
            {
                buffer: file.buffer,
                originalName: file.originalname,
                mimeType: file.mimetype,
            },
        );
    }

    @Get(':id/payment-proof')
    @ApiOperation({
        summary:
            'Download only the current canonical payment proof as its authenticated owner',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    async downloadPaymentProof(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param('id') id: string,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.paymentProofs.openForWeb(
            session,
            Number(id),
        );
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Length', file.sizeBytes);
        response.setHeader(
            'Content-Disposition',
            paymentProofContentDisposition(file.originalName),
        );
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    }

    @Post(':id/messages')
    @ApiOperation({ summary: 'Add a customer-visible message' })
    @RateLimit('public-form', 30, 600)
    addMessage(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ServiceRequestMessageDto,
    ) {
        return this.serviceRequestsService.addCustomerMessage(
            session,
            Number(params.id),
            body.text,
        );
    }

    @Post(':id/messages/attachments')
    @ApiOperation({ summary: 'Attach a file to the customer conversation' })
    @UseGuards(MessageServiceRequestUploadGuard)
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurpose('service-attachment'),
        ),
    )
    @RateLimit('public-form', 20, 600)
    addMessageAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.serviceRequestsService.addCustomerMessageAttachment(
            session,
            Number(params.id),
            {
                buffer: file.buffer,
                originalName: file.originalname,
                mimeType: file.mimetype,
            },
        );
    }

    @Get(':id/attachments/:attachmentId')
    @ApiOperation({ summary: 'Download an owned customer-visible attachment' })
    @RateLimit('public-sensitive-read', 60, 60)
    async downloadAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
        @Res() response: Response,
    ) {
        const { file, stream } =
            await this.serviceRequestsService.openCustomerAttachment(
                session,
                Number(id),
                Number(attachmentId),
            );
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName || 'file')}`,
        );
        stream.pipe(response);
    }
}
