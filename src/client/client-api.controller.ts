import * as fs from 'node:fs';
import * as path from 'node:path';
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
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RegistrationsService } from 'src/registrations/registrations.service';
import { CurrentWebSession } from 'src/web-session/web-session.decorators';
import { WebSessionGuard } from 'src/web-session/web-session.guard';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ClientWorkflowService } from './client-workflow.service';
import type { ClientIdentity } from './client-workflow.types';
import {
    ClientContextDto,
    ClientIdParamDto,
    RegistrationAnswerDto,
    RegistrationFormDto,
    RegistrationRequirementParamDto,
    RegistrationRequirementValueDto,
    TicketMediaDto,
    TicketMessageDto,
} from './dto/client-api.dto';
import { RateLimit } from 'src/security/rate-limit';
import { FilesService } from 'src/files/files.service';
import { RegistrationReadinessService } from 'src/registrations/registration-readiness.service';

interface UploadedMemoryFile {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
}

@Controller('api/client')
@ApiTags('client')
@UseGuards(WebSessionGuard)
export class ClientApiController {
    constructor(
        private readonly clientWorkflow: ClientWorkflowService,
        private readonly registrationsService: RegistrationsService,
        private readonly filesService: FilesService,
        private readonly registrationReadiness: RegistrationReadinessService,
    ) {}

    @Post('users')
    @RateLimit('public-form', 30, 600)
    upsertUser(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: ClientContextDto,
    ) {
        return this.clientWorkflow.upsertClient(this.identity(session, body));
    }

    @Get('registration-fields')
    @RateLimit('public-read', 120, 60)
    getRegistrationFields() {
        return this.registrationsService.getAllFields();
    }

    @Post('registrations/start')
    @RateLimit('public-form', 30, 600)
    startRegistration(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: ClientContextDto,
    ) {
        return this.clientWorkflow.startRegistration(
            this.identity(session, body),
        );
    }

    @Post('registrations/answer')
    @RateLimit('public-form', 30, 600)
    submitRegistrationAnswer(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: RegistrationAnswerDto,
    ) {
        return this.clientWorkflow.submitRegistrationAnswer(
            this.identity(session, body),
            body.value,
        );
    }

    @Post('registrations/form')
    @RateLimit('public-form', 30, 600)
    submitRegistrationForm(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: RegistrationFormDto,
    ) {
        return this.clientWorkflow.submitRegistrationForm(
            this.identity(session, body),
            body.values,
        );
    }

    @Get('registrations/:id/checklist')
    @RateLimit('public-sensitive-read', 60, 60)
    getRegistrationChecklist(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
    ) {
        return this.registrationReadiness.clientDetails(
            this.identity(session),
            Number(params.id),
        );
    }

    @Post('registrations/:id/requirements/:kind/value')
    @RateLimit('public-form', 30, 600)
    provideRegistrationValue(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationRequirementParamDto,
        @Body() body: RegistrationRequirementValueDto,
    ) {
        return this.registrationReadiness.provideValue(
            this.identity(session, body),
            Number(params.id),
            params.kind,
            body.value,
        );
    }

    @Post('registrations/:id/requirements/:kind/evidence')
    @RateLimit('public-form', 20, 600)
    @UseInterceptors(FileInterceptor('file'))
    provideRegistrationEvidence(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationRequirementParamDto,
        @UploadedFile() file?: UploadedMemoryFile,
    ) {
        if (!file) throw new BadRequestException('Evidence file is required');
        return this.registrationReadiness.uploadEvidence(
            this.identity(session),
            Number(params.id),
            params.kind,
            {
                buffer: file.buffer,
                fileName: file.originalname,
                mimeType: file.mimetype,
            },
        );
    }

    @Post('tickets/open')
    @RateLimit('public-message', 60, 600)
    openTicket(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: ClientContextDto,
    ) {
        return this.clientWorkflow.openTicket(this.identity(session, body));
    }

    @Get('tickets/active')
    @RateLimit('public-sensitive-read', 60, 60)
    getActiveTicket(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.clientWorkflow.getActiveTicket(this.identity(session));
    }

    @Get('tickets/:id/messages')
    @RateLimit('public-sensitive-read', 60, 60)
    getTicketMessages(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
    ) {
        return this.clientWorkflow.getTicketMessages(
            this.identity(session),
            Number(params.id),
        );
    }

    @Post('tickets/messages')
    @RateLimit('public-message', 60, 600)
    submitTicketMessage(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: TicketMessageDto,
    ) {
        return this.clientWorkflow.submitTicketMessage(
            this.identity(session, body),
            body.text,
        );
    }

    @Post('tickets/media')
    @RateLimit('public-message', 60, 600)
    @UseInterceptors(FileInterceptor('file'))
    async submitTicketMedia(
        @CurrentWebSession() session: WebSessionPrincipal,
        @UploadedFile() file: UploadedMemoryFile | undefined,
        @Body() body: TicketMediaDto,
    ) {
        if (!file) throw new BadRequestException('Ticket file is required');
        return this.clientWorkflow.submitTicketMedia(
            this.identity(session, body),
            {
                messageType: this.detectMessageType(
                    file.mimetype,
                    file.originalname,
                ),
                buffer: file.buffer,
                fileName: file.originalname || 'file',
                mimeType: file.mimetype,
                fileSize: file.size,
                text: body.text,
            },
        );
    }

    @Post('tickets/:id/messages')
    @RateLimit('public-message', 60, 600)
    async submitTicketMessageAlias(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Body() body: TicketMessageDto,
    ) {
        const identity = this.identity(session, body);
        await this.clientWorkflow.getTicketMessages(
            identity,
            Number(params.id),
        );
        return this.clientWorkflow.submitTicketMessage(identity, body.text);
    }

    @Get('ticket-messages/:id/file')
    @RateLimit('public-sensitive-read', 60, 60)
    async getTicketMessageFile(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: ClientIdParamDto,
        @Res() response: Response,
    ) {
        const message = await this.clientWorkflow.getTicketMessageFile(
            this.identity(session),
            Number(params.id),
        );
        if (message.storedFileId) {
            const { file, stream } = await this.filesService.open(
                message.storedFileId,
            );
            response.setHeader('Content-Type', file.mimeType);
            response.setHeader(
                'Content-Disposition',
                `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
            );
            response.setHeader('Cache-Control', 'private, no-store');
            response.setHeader('X-Content-Type-Options', 'nosniff');
            stream.pipe(response);
            return;
        }
        if (!message.localPath || !fs.existsSync(message.localPath)) {
            throw new BadRequestException('Ticket file was not found');
        }
        return response.download(
            message.localPath,
            message.fileName || `ticket_message_${params.id}`,
        );
    }

    private identity(
        session: WebSessionPrincipal,
        input?: ClientContextDto,
    ): ClientIdentity {
        return {
            platform: 'web',
            chatId: session.chatId,
            name: input?.name,
            organizationId: input?.organizationId,
        };
    }

    private detectMessageType(mimeType?: string, fileName?: string) {
        const mime = mimeType?.toLowerCase() || '';
        const extension = path.extname(fileName || '').toLowerCase();
        if (mime.startsWith('image/')) return 'image' as const;
        if (mime.startsWith('video/')) return 'video' as const;
        if (mime.startsWith('audio/')) return 'audio' as const;
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
            return 'image' as const;
        }
        if (['.mp4', '.mov', '.webm'].includes(extension)) {
            return 'video' as const;
        }
        if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extension)) {
            return 'audio' as const;
        }
        return 'document' as const;
    }
}
