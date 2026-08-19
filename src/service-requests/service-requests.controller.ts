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
import type { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    ClientContextDto,
    ClientIdParamDto,
    ServiceRequestAnswerDto,
    ServiceRequestStartDto,
} from 'src/client/dto/client-api.dto';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestsService } from './service-requests.service';
import { RateLimit } from 'src/security/rate-limit';
import { CanonicalServiceRequestsService } from './canonical-service-requests.service';
import {
    CreateServiceRequestDraftDto,
    ServiceRequestMessageDto,
    SubmitServiceRequestDto,
    UpdateServiceRequestDraftDto,
} from './dto/canonical-service-request.dto';

@Controller('api/client/service-requests')
@ApiTags('service-requests')
@ApiCookieAuth('webSession')
@UseGuards(WebSessionGuard)
export class ServiceRequestsController {
    constructor(
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly canonicalRequests: CanonicalServiceRequestsService,
    ) {}

    @Get('types')
    @ApiOperation({
        summary: 'List active service types and published form versions',
    })
    @RateLimit('public-read', 120, 60)
    getTypes() {
        return this.canonicalRequests.getTypesWithForms();
    }

    @Get()
    @ApiOperation({
        summary: 'List service requests owned by the current web session',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    getClientRequests(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.canonicalRequests.listForWeb(session);
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
        return this.canonicalRequests.createWebDraft(session, body);
    }

    @Patch('drafts/:id')
    @ApiOperation({ summary: 'Partially update structured draft answers' })
    @RateLimit('public-form', 60, 600)
    updateDraft(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: UpdateServiceRequestDraftDto,
    ) {
        return this.canonicalRequests.updateWebDraft(
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
        return this.canonicalRequests.submitWebDraft(
            session,
            Number(params.id),
            body.expectedVersion,
            body.idempotencyKey,
        );
    }

    @Post('drafts/:id/attachments')
    @ApiOperation({ summary: 'Upload a validated draft attachment' })
    @UseInterceptors(FileInterceptor('file'))
    @RateLimit('public-form', 20, 600)
    addAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.canonicalRequests.addWebAttachment(
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
        return this.canonicalRequests.removeWebAttachment(
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
        return this.canonicalRequests.getForWeb(session, Number(params.id));
    }

    @Post(':id/messages')
    @ApiOperation({ summary: 'Add a customer-visible message' })
    @RateLimit('public-form', 30, 600)
    addMessage(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ServiceRequestMessageDto,
    ) {
        return this.canonicalRequests.addCustomerMessage(
            session,
            Number(params.id),
            body.text,
        );
    }

    @Post(':id/messages/attachments')
    @ApiOperation({ summary: 'Attach a file to the customer conversation' })
    @UseInterceptors(FileInterceptor('file'))
    @RateLimit('public-form', 20, 600)
    addMessageAttachment(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.canonicalRequests.addCustomerMessageAttachment(
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
            await this.canonicalRequests.openCustomerAttachment(
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

    @Post('start')
    @RateLimit('public-form', 30, 600)
    start(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: ServiceRequestStartDto,
    ) {
        return this.serviceRequestsService.start(
            this.identity(session, body),
            body.serviceTypeCode,
        );
    }

    @Post(':id/answers')
    @RateLimit('public-form', 30, 600)
    answer(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ServiceRequestAnswerDto,
    ) {
        return this.serviceRequestsService.answer(
            this.identity(session, body),
            Number(params.id),
            body.value,
        );
    }

    @Post(':id/confirm-price')
    @RateLimit('public-form', 30, 600)
    confirmPrice(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: ClientContextDto,
    ) {
        return this.serviceRequestsService.confirmPrice(
            this.identity(session, body),
            Number(params.id),
        );
    }

    private identity(
        session: WebSessionPrincipal,
        body?: ClientContextDto,
    ) {
        return {
            platform: 'web' as const,
            chatId: session.chatId,
            name: body?.name,
            organizationId: body?.organizationId,
        };
    }
}
