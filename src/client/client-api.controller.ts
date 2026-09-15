import * as path from 'node:path';
import { RegistrationClientReadService } from 'src/registrations/registration-client-read.service';
import { RegistrationClientCommandsService } from 'src/registrations/registration-client-commands.service';
import { RegistrationIdParamDto } from 'src/registrations/registration-admin.dto';
import {
    RegistrationClientRequirementParams,
    RegistrationClientValueDto,
    RegistrationEvidenceVersionDto,
} from 'src/registrations/registration-client.dto';
import { WebMutationOriginGuard } from 'src/web-session/web-mutation-origin.guard';
import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Param,
    Post,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    multipartOptionsForPurpose,
    multipartOptionsForPurposes,
} from 'src/files/multipart-options';
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
    TicketMediaDto,
    TicketMessageDto,
} from './dto/client-api.dto';
import { RateLimit } from 'src/security/rate-limit';
import { FilesService } from 'src/files/files.service';
import { RegistrationEvidenceUploadGuard } from './registration-evidence-upload.guard';
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
        private readonly registrationRead: RegistrationClientReadService,
        private readonly registrationCommands: RegistrationClientCommandsService,
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
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    startRegistration(@CurrentWebSession() session: WebSessionPrincipal) {
        return this.registrationCommands.legacyStart(session);
    }

    @Post('registrations/answer')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    submitRegistrationAnswer(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: RegistrationAnswerDto,
    ) {
        return this.registrationCommands.legacyAnswer(session, body.value);
    }

    @Post('registrations/form')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    submitRegistrationForm(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Body() body: RegistrationFormDto,
    ) {
        return this.registrationCommands.legacyForm(session, body.values);
    }

    @Get('registrations/:id/checklist')
    @Header('Cache-Control', 'private, no-store')
    @RateLimit('public-sensitive-read', 60, 60)
    getRegistrationChecklist(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationIdParamDto,
    ) {
        return this.registrationRead.details(session, Number(params.id));
    }

    @Post('registrations/:id/requirements/:kind/value')
    @UseGuards(WebMutationOriginGuard)
    @RateLimit('public-form', 30, 600)
    async provideRegistrationValue(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationClientRequirementParams,
        @Body() body: RegistrationClientValueDto,
    ) {
        await this.registrationReadiness.provideValue(
            session,
            Number(params.id),
            params.kind,
            body.value,
            body.expectedRequirementVersion,
        );
        return this.registrationRead.details(session, Number(params.id));
    }

    @Post('registrations/:id/requirements/:kind/evidence')
    @RateLimit('public-form', 20, 600)
    @UseGuards(WebMutationOriginGuard, RegistrationEvidenceUploadGuard)
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurpose('registration-evidence', 1),
        ),
    )
    async provideRegistrationEvidence(
        @CurrentWebSession() session: WebSessionPrincipal,
        @Param() params: RegistrationClientRequirementParams,
        @Body() body: RegistrationEvidenceVersionDto,
        @UploadedFile() file?: UploadedMemoryFile,
    ) {
        if (!file) throw new BadRequestException('Evidence file is required');
        await this.registrationReadiness.uploadEvidence(
            session,
            Number(params.id),
            params.kind,
            {
                buffer: file.buffer,
                fileName: file.originalname,
                mimeType: file.mimetype,
            },
            body.expectedRequirementVersion,
        );
        return this.registrationRead.details(session, Number(params.id));
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
    @UseInterceptors(
        FileInterceptor(
            'file',
            multipartOptionsForPurposes(
                [
                    'ticket-image',
                    'ticket-document',
                    'ticket-audio',
                    'ticket-video',
                ],
                3,
            ),
        ),
    )
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
        if (!message.storedFileId) {
            throw new BadRequestException('Ticket file was not found');
        }
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
