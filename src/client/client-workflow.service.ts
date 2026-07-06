import { BadRequestException, Injectable } from '@nestjs/common';
import { RegistrationsService } from 'src/registrations/registrations.service';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import { TicketsService } from 'src/tickets/tickets.service';
import type { TicketMediaInput } from 'src/tickets/tickets.service';
import { UsersService } from 'src/users/users.service';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { CustomerActivityService } from 'src/customer-activity/customer-activity.service';
import type { ClientFlowResult, ClientIdentity, StartSimpleServiceRequestInput } from './client-workflow.types';
import type { RegistrationField } from 'src/registrations/registration.types';

@Injectable()
export class ClientWorkflowService {
    constructor(
        private readonly usersService: UsersService,
        private readonly registrationsService: RegistrationsService,
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly ticketsService: TicketsService,
        private readonly organizationsService: OrganizationsService,
        private readonly activityService: CustomerActivityService,
    ) { }

    async upsertClient(input: ClientIdentity) {
        return this.usersService.getOrCreateOrUpdate(
            input.chatId,
            input.name,
            input.username,
            input.platform,
        );
    }

    async startRegistration(input: ClientIdentity): Promise<ClientFlowResult> {
        const { user, organizationId } = await this.resolveClientContext(input);

        let registration = await this.registrationsService.getNotFilledReg(input.chatId, input.platform);
        const status = registration ? 'continued' : 'started';

        if (!registration) {
            registration = await this.registrationsService.createRegistration(
                input.chatId,
                input.platform,
                user.id,
                organizationId,
            );
        }

        const nextField = await this.registrationsService.getFieldTextByStep(registration.currentStep);

        if (!nextField) {
            return {
                status: 'completed',
                message: 'Registration is already completed.',
                data: registration,
            };
        }

        return {
            status,
            message: status === 'started'
                ? 'Registration request created.'
                : 'Unfinished registration request found.',
            nextField,
            data: registration,
        };
    }

    async submitRegistrationAnswer(input: ClientIdentity, value: string): Promise<ClientFlowResult> {
        await this.resolveClientContext(input);

        const registration = await this.registrationsService.saveFieldValue(input.chatId, value, input.platform);
        if (!registration) {
            return {
                status: 'not_found',
                message: 'Registration request was not found.',
            };
        }

        const nextField = await this.registrationsService.getFieldTextByStep(registration.currentStep);
        if (nextField) {
            return {
                status: 'continued',
                message: 'Registration answer saved.',
                nextField,
                data: registration,
            };
        }

        const filePath = await this.registrationsService.finishReg(registration);
        await this.registrationsService.notifyAdminsAboutNewReg(registration, filePath);

        return {
            status: 'completed',
            message: 'Registration request completed.',
            data: registration,
        };
    }

    async submitRegistrationForm(input: ClientIdentity, values: Partial<Record<RegistrationField, string>>): Promise<ClientFlowResult> {
        const { user, organizationId } = await this.resolveClientContext(input);

        let registration = await this.registrationsService.getNotFilledReg(input.chatId, input.platform);
        if (!registration) {
            registration = await this.registrationsService.createRegistration(
                input.chatId,
                input.platform,
                user.id,
                organizationId,
            );
        }

        const filled = await this.registrationsService.fillRegistration(input.chatId, values, input.platform);
        if (!filled) {
            return {
                status: 'not_found',
                message: 'Registration request was not found.',
            };
        }

        const filePath = await this.registrationsService.finishReg(filled);
        await this.registrationsService.notifyAdminsAboutNewReg(filled, filePath);

        return {
            status: 'completed',
            message: 'Registration request completed.',
            data: filled,
        };
    }

    async startSimpleServiceRequest(input: StartSimpleServiceRequestInput): Promise<ClientFlowResult> {
        const identity = await this.resolveServiceRequestIdentity(input);
        const request = await this.serviceRequestsService.getLatestDraftForClient(identity, [input.serviceTypeCode]);
        const status = request ? 'continued' : 'started';
        const result = request
            ? this.serviceRequestsService.present(request)
            : await this.serviceRequestsService.start(identity, input.serviceTypeCode);

        const nextField = result.nextStep?.label;

        return {
            status,
            message: status === 'started'
                ? `Service request created: ${result.request.serviceTypeTitle}.`
                : 'Unfinished service request found.',
            nextField,
            data: result.request,
        };
    }

    async submitSimpleServiceRequestAnswer(input: ClientIdentity, value: string): Promise<ClientFlowResult> {
        const identity = await this.resolveServiceRequestIdentity(input);
        const result = await this.serviceRequestsService.answerLatestDraft(
            identity,
            value,
            ['firmware_update', 'kkt_remote_work'],
        );
        if (!result) {
            return {
                status: 'not_found',
                message: 'Service request was not found.',
            };
        }

        const nextField = result.nextStep?.label;

        return {
            status: nextField ? 'continued' : 'completed',
            message: nextField ? 'Service request answer saved.' : 'Service request completed.',
            nextField,
            data: result.request,
        };
    }

    async openTicket(input: ClientIdentity): Promise<ClientFlowResult> {
        const { user, organizationId } = await this.resolveClientContext(input);

        const activeTicket = await this.ticketsService.getActiveTicket(input.chatId, input.platform);
        if (activeTicket?.text) {
            return {
                status: 'already_open',
                message: 'Client already has an open ticket.',
                data: activeTicket,
            };
        }

        const ticket = activeTicket ?? await this.ticketsService.createTicket(
            input.chatId,
            input.username,
            input.name,
            undefined,
            input.platform,
            user.id,
            organizationId,
        );

        return {
            status: activeTicket ? 'continued' : 'started',
            message: 'Ticket is ready for the first message.',
            data: ticket,
        };
    }

    async submitTicketMessage(input: ClientIdentity, text: string): Promise<ClientFlowResult> {
        const { user, organizationId } = await this.resolveClientContext(input);

        let ticket = await this.ticketsService.getActiveTicket(input.chatId, input.platform);
        if (!ticket) {
            ticket = await this.ticketsService.createTicket(
                input.chatId,
                input.username,
                input.name,
                undefined,
                input.platform,
                user.id,
                organizationId,
            );
        }

        const savedTicket = await this.ticketsService.saveTicketText(input.chatId, text, input.platform);
        if (!savedTicket) {
            return {
                status: 'not_found',
                message: 'Ticket was not found.',
            };
        }

        if (!ticket.text) {
            await this.ticketsService.notifyOperatorsAboutNewTicket(savedTicket);
        }

        await this.activityService.add({
            userId: user.id,
            organizationId,
            platform: input.platform,
            chatId: input.chatId,
            type: 'ticket_message',
            title: 'Сообщение оператору',
            description: text,
            ticketId: savedTicket.id,
        });

        return {
            status: 'completed',
            message: 'Ticket message saved.',
            data: savedTicket,
        };
    }

    async submitTicketMedia(input: ClientIdentity, media: TicketMediaInput): Promise<ClientFlowResult> {
        const { user, organizationId } = await this.resolveClientContext(input);

        let ticket = await this.ticketsService.getActiveTicket(input.chatId, input.platform);
        if (!ticket) {
            ticket = await this.ticketsService.createTicket(
                input.chatId,
                input.username,
                input.name,
                undefined,
                input.platform,
                user.id,
                organizationId,
            );
        }

        const savedTicket = await this.ticketsService.saveTicketMedia(input.chatId, media, input.platform);
        if (!savedTicket) {
            return {
                status: 'not_found',
                message: 'Ticket was not found.',
            };
        }

        await this.ticketsService.notifyOperatorsAboutTicketMessage(
            savedTicket,
            `Новое вложение в тикете #${savedTicket.id}: ${media.fileName || media.messageType}`,
        );

        await this.activityService.add({
            userId: user.id,
            organizationId,
            platform: input.platform,
            chatId: input.chatId,
            type: 'ticket_message',
            title: 'Вложение оператору',
            description: media.fileName || media.messageType,
            ticketId: savedTicket.id,
        });

        return {
            status: 'completed',
            message: 'Ticket media saved.',
            data: savedTicket,
        };
    }

    async getActiveTicket(input: ClientIdentity): Promise<ClientFlowResult> {
        await this.resolveClientContext(input);
        const ticket = await this.ticketsService.getActiveTicket(input.chatId, input.platform);

        if (!ticket) {
            return {
                status: 'not_found',
                message: 'Active ticket was not found.',
            };
        }

        return {
            status: 'completed',
            message: 'Active ticket found.',
            data: ticket,
        };
    }

    async getTicketMessages(input: ClientIdentity, ticketId: number) {
        await this.assertTicketOwner(input, ticketId);
        return this.ticketsService.getTicketMessages(ticketId);
    }

    async getTicketMessageFile(input: ClientIdentity, messageId: number) {
        const message = await this.ticketsService.getTicketMessageById(messageId);
        if (!message) {
            throw new BadRequestException('Ticket message was not found.');
        }

        await this.assertTicketOwner(input, message.ticketId);
        return message;
    }

    private async assertTicketOwner(input: ClientIdentity, ticketId: number) {
        await this.resolveClientContext(input);
        const ticket = await this.ticketsService.getTicketById(ticketId);
        if (!ticket || ticket.userChatId !== input.chatId || ticket.platform !== input.platform) {
            throw new BadRequestException('Ticket was not found for this client.');
        }

        return ticket;
    }

    private async resolveClientContext(input: ClientIdentity) {
        const user = await this.upsertClient(input);
        await this.organizationsService.assertUserOrganization(
            input.chatId,
            input.platform,
            input.organizationId,
        );

        return { user, organizationId: input.organizationId };
    }

    private async resolveServiceRequestIdentity(input: ClientIdentity) {
        await this.resolveClientContext(input);
        return {
            platform: input.platform,
            chatId: input.chatId,
            username: input.username,
            name: input.name,
            organizationId: input.organizationId,
        };
    }
}
