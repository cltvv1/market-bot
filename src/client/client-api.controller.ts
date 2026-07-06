import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RegistrationsService } from 'src/registrations/registrations.service';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { RegistrationField } from 'src/registrations/registration.types';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import { ClientWorkflowService } from './client-workflow.service';
import type { ClientIdentity } from './client-workflow.types';

interface ClientIdentityBody {
    platform?: UserPlatform;
    chatId?: string;
    username?: string;
    name?: string;
    organizationId?: number;
}

@Controller('api/client')
@ApiTags('client')
export class ClientApiController {
    constructor(
        private readonly clientWorkflow: ClientWorkflowService,
        private readonly registrationsService: RegistrationsService,
        private readonly serviceRequestsService: ServiceRequestsService,
    ) { }

    @Post('users')
    upsertUser(@Body() body: ClientIdentityBody) {
        return this.clientWorkflow.upsertClient(this.parseIdentity(body));
    }

    @Get('registration-fields')
    getRegistrationFields() {
        return this.registrationsService.getAllFields();
    }

    @Post('registrations/start')
    startRegistration(@Body() body: ClientIdentityBody) {
        return this.clientWorkflow.startRegistration(this.parseIdentity(body));
    }

    @Post('registrations/answer')
    submitRegistrationAnswer(@Body() body: ClientIdentityBody & { value?: string }) {
        return this.clientWorkflow.submitRegistrationAnswer(
            this.parseIdentity(body),
            this.parseText(body.value, 'Registration answer is required'),
        );
    }

    @Post('registrations/form')
    submitRegistrationForm(@Body() body: ClientIdentityBody & { values?: Partial<Record<RegistrationField, string>> }) {
        if (!body.values || typeof body.values !== 'object') {
            throw new BadRequestException('Registration values are required');
        }

        return this.clientWorkflow.submitRegistrationForm(this.parseIdentity(body), body.values);
    }

    @Get('service-requests/types')
    getServiceTypes() {
        return this.serviceRequestsService.getServiceTypes();
    }

    @Get('service-requests')
    getServiceRequests(@Query() query: ClientIdentityBody) {
        return this.serviceRequestsService.listForClient(this.parseIdentity(query));
    }

    @Post('service-requests/start')
    startServiceRequest(@Body() body: ClientIdentityBody & { serviceTypeCode?: string }) {
        const serviceTypeCode = this.parseText(body.serviceTypeCode, 'Service type code is required');
        return this.serviceRequestsService.start(this.parseIdentity(body), serviceTypeCode);
    }

    @Post('service-requests/:id/answers')
    submitServiceRequestAnswer(@Param('id') id: string, @Body() body: ClientIdentityBody & { value?: string }) {
        return this.serviceRequestsService.answer(
            this.parseIdentity(body),
            this.parsePositiveNumber(id, 'id'),
            this.parseText(body.value, 'Service request answer is required'),
        );
    }

    @Post('service-requests/:id/confirm-price')
    confirmServiceRequestPrice(@Param('id') id: string, @Body() body: ClientIdentityBody) {
        return this.serviceRequestsService.confirmPrice(
            this.parseIdentity(body),
            this.parsePositiveNumber(id, 'id'),
        );
    }

    @Post('tickets/open')
    openTicket(@Body() body: ClientIdentityBody) {
        return this.clientWorkflow.openTicket(this.parseIdentity(body));
    }

    @Get('tickets/active')
    getActiveTicket(@Query() query: ClientIdentityBody) {
        return this.clientWorkflow.getActiveTicket(this.parseIdentity(query));
    }

    @Get('tickets/:id/messages')
    getTicketMessages(@Param('id') id: string, @Query() query: ClientIdentityBody) {
        return this.clientWorkflow.getTicketMessages(this.parseIdentity(query), this.parsePositiveNumber(id, 'id'));
    }

    @Post('tickets/messages')
    submitTicketMessage(@Body() body: ClientIdentityBody & { text?: string }) {
        return this.clientWorkflow.submitTicketMessage(
            this.parseIdentity(body),
            this.parseText(body.text, 'Ticket message text is required'),
        );
    }

    @Post('tickets/media')
    @UseInterceptors(FileInterceptor('file'))
    submitTicketMedia(@UploadedFile() file: any, @Body() body: ClientIdentityBody & { text?: string }) {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const mediaDir = path.join(process.cwd(), 'storage', 'ticket-media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const safeName = `${randomUUID()}-${file.originalname || 'file'}`;
        const filePath = path.join(mediaDir, safeName);
        fs.writeFileSync(filePath, file.buffer);

        return this.clientWorkflow.submitTicketMedia(this.parseIdentity(body), {
            messageType: this.detectMessageType(file.mimetype, file.originalname),
            text: body.text?.trim() || undefined,
            fileName: file.originalname || safeName,
            mimeType: file.mimetype,
            fileSize: file.size,
            localPath: filePath,
        });
    }

    @Post('tickets/:id/messages')
    submitTicketMessageById(@Param('id') _id: string, @Body() body: ClientIdentityBody & { text?: string }) {
        return this.submitTicketMessage(body);
    }

    @Get('ticket-messages/:id/file')
    async downloadTicketMessageFile(@Param('id') id: string, @Query() query: ClientIdentityBody, @Res() response: Response) {
        const message = await this.clientWorkflow.getTicketMessageFile(
            this.parseIdentity(query),
            this.parsePositiveNumber(id, 'id'),
        );
        if (!message.localPath || !fs.existsSync(message.localPath)) {
            throw new BadRequestException('File not found');
        }

        return response.download(message.localPath, message.fileName || `ticket_message_${id}`);
    }

    private parseIdentity(body: ClientIdentityBody): ClientIdentity {
        const platform = body.platform ?? 'web';
        if (platform !== 'telegram' && platform !== 'max' && platform !== 'web') {
            throw new BadRequestException('Valid platform is required');
        }

        const chatId = body.chatId?.trim();
        if (!chatId) {
            throw new BadRequestException('chatId is required');
        }

        return {
            platform,
            chatId,
            username: body.username?.trim() || undefined,
            name: body.name?.trim() || undefined,
            organizationId: this.parseOptionalNumber(body.organizationId, 'organizationId'),
        };
    }

    private parseText(value: string | undefined, message: string) {
        const text = value?.trim();
        if (!text) {
            throw new BadRequestException(message);
        }

        return text;
    }

    private parseOptionalNumber(value: number | undefined, fieldName: string) {
        if (value === undefined || value === null) {
            return undefined;
        }

        return this.parsePositiveNumber(value, fieldName);
    }

    private parsePositiveNumber(value: number | string | undefined, fieldName: string) {
        const numberValue = Number(value);
        if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
            throw new BadRequestException(`${fieldName} must be a positive integer`);
        }

        return numberValue;
    }

    private detectMessageType(mimeType?: string, fileName?: string) {
        if (mimeType?.startsWith('image/')) return 'image';
        if (mimeType?.startsWith('video/')) return 'video';
        if (mimeType?.startsWith('audio/')) return 'audio';
        if (fileName?.toLowerCase().endsWith('.ogg')) return 'voice';

        return 'document';
    }

}
