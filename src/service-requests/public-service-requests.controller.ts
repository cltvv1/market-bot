import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { multipartOptionsForPurpose } from 'src/files/multipart-options';
import type { Response } from 'express';
import { RateLimit } from 'src/security/rate-limit';
import { ServiceRequestsService } from './service-requests.service';
import {
    PublicServiceRequestAttachmentParamDto,
    ServiceRequestMessageDto,
} from './dto/canonical-service-request.dto';
import { PublicServiceRequestUploadGuard } from './service-request-upload.guard';
import {
    CurrentPublicServiceRequestAccess,
    PublicServiceRequestAccessGuard,
} from './public-service-request-access.guard';
import type { PublicServiceRequestAccess } from './service-request-public-access.service';
import { paymentProofContentDisposition } from './service-request-payment-proof';

@Controller('api/public/service-requests')
@ApiTags('service-requests-public')
@UseGuards(PublicServiceRequestAccessGuard)
export class PublicServiceRequestsController {
    constructor(private readonly requests: ServiceRequestsService) {}

    @Get('status')
    @ApiOperation({
        summary: 'Read customer-safe request status using an access token',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    getStatus(
        @CurrentPublicServiceRequestAccess() access: PublicServiceRequestAccess,
    ) {
        return this.requests.getPublicStatus(access);
    }

    @Post('messages')
    @ApiOperation({ summary: 'Reply to a request using an access token' })
    @RateLimit('public-form', 20, 600)
    addMessage(
        @CurrentPublicServiceRequestAccess() access: PublicServiceRequestAccess,
        @Body() body: ServiceRequestMessageDto,
    ) {
        return this.requests.addPublicMessage(access, body.text);
    }

    @Post('messages/attachments')
    @ApiOperation({ summary: 'Attach a file using an access token' })
    @UseGuards(PublicServiceRequestUploadGuard)
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurpose('service-attachment'),
        ),
    )
    @RateLimit('public-form', 20, 600)
    addMessageAttachment(
        @CurrentPublicServiceRequestAccess() access: PublicServiceRequestAccess,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.requests.addPublicMessageAttachment(access, {
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
        });
    }

    @Get('attachments/:attachmentId')
    @ApiOperation({
        summary: 'Download a customer-visible attachment using an access token',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    async downloadAttachment(
        @CurrentPublicServiceRequestAccess() access: PublicServiceRequestAccess,
        @Param() params: PublicServiceRequestAttachmentParamDto,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.requests.openPublicAttachment(
            access,
            params.attachmentId,
        );
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader(
            'Content-Disposition',
            paymentProofContentDisposition(file.originalName || 'file'),
        );
        response.setHeader('Content-Length', file.sizeBytes);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    }
}
