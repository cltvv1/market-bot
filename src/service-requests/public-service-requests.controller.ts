import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RateLimit } from 'src/security/rate-limit';
import { CanonicalServiceRequestsService } from './canonical-service-requests.service';
import {
    PublicServiceRequestAttachmentParamDto,
    PublicServiceRequestTokenParamDto,
    ServiceRequestMessageDto,
} from './dto/canonical-service-request.dto';

@Controller('api/public/service-requests')
@ApiTags('service-requests-public')
export class PublicServiceRequestsController {
    constructor(private readonly requests: CanonicalServiceRequestsService) {}

    @Get(':token')
    @ApiOperation({
        summary: 'Read customer-safe request status using an access token',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    getStatus(@Param() params: PublicServiceRequestTokenParamDto) {
        return this.requests.getByPublicToken(params.token);
    }

    @Post(':token/messages')
    @ApiOperation({ summary: 'Reply to a request using an access token' })
    @RateLimit('public-form', 20, 600)
    addMessage(
        @Param() params: PublicServiceRequestTokenParamDto,
        @Body() body: ServiceRequestMessageDto,
    ) {
        return this.requests.addPublicMessage(params.token, body.text);
    }

    @Post(':token/messages/attachments')
    @ApiOperation({ summary: 'Attach a file using an access token' })
    @UseInterceptors(FileInterceptor('file'))
    @RateLimit('public-form', 20, 600)
    addMessageAttachment(
        @Param() params: PublicServiceRequestTokenParamDto,
        @UploadedFile()
        file?: { buffer: Buffer; originalname?: string; mimetype?: string },
    ) {
        if (!file) throw new BadRequestException('Attachment file is required');
        return this.requests.addPublicMessageAttachment(params.token, {
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
        });
    }

    @Get(':token/attachments/:attachmentId')
    @ApiOperation({
        summary: 'Download a customer-visible attachment using an access token',
    })
    @RateLimit('public-sensitive-read', 60, 60)
    async downloadAttachment(
        @Param() params: PublicServiceRequestAttachmentParamDto,
        @Res() response: Response,
    ) {
        const { file, stream } = await this.requests.openPublicAttachment(
            params.token,
            params.attachmentId,
        );
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName || 'file')}`,
        );
        stream.pipe(response);
    }
}
