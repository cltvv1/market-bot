import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';
import {
    TicketMessageEntity,
    TicketMessageSender,
    TicketMessageSource,
    TicketMessageType,
} from './entities/ticket-message.entity';
import { UsersService } from 'src/users/users.service';
import { formatTicket } from 'src/common/utils';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { UserPlatform } from 'src/users/entities/user.entity';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { FilesService } from 'src/files/files.service';
import type { FilePurpose } from 'src/files/file-storage.types';

export interface TicketMediaInput {
    messageType: Exclude<TicketMessageType, 'text'>;
    text?: string;
    fileId?: string;
    fileUniqueId?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    externalUrl?: string;
    buffer?: Buffer;
}

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,
        @InjectRepository(TicketMessageEntity)
        private readonly messagesRepo: Repository<TicketMessageEntity>,

        private usersService: UsersService,
        @Inject(MESSENGER_SERVICE)
        private messengerService: MessengerService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly filesService: FilesService,
    ) {}

    async createTicket(
        userChatId: string,
        username?: string,
        name?: string,
        text?: string,
        platform: UserPlatform = 'telegram',
        userId?: number,
        organizationId?: number,
    ) {
        const ticket = this.ticketRepo.create({
            userChatId,
            platform,
            userId,
            organizationId,
            username: username,
            name: name,
            text: text,
        });
        const savedTicket = await this.ticketRepo.save(ticket);

        if (text?.trim()) {
            await this.addMessage(
                savedTicket.id,
                'user',
                text.trim(),
                userChatId,
                'bot',
            );
        }

        return savedTicket;
    }

    async getActiveTicket(chatId: string, platform: UserPlatform = 'telegram') {
        return this.ticketRepo.findOne({
            where: {
                userChatId: chatId,
                platform,
                isAnswered: false,
            },
            order: { createdAt: 'DESC' },
        });
    }

    async closeTicket(ticketId: number, operatorChatId: string) {
        await this.ticketRepo.update(ticketId, {
            isAnswered: true,
            answeredBy: operatorChatId,
        });

        return this.ticketRepo.findOne({ where: { id: ticketId } });
    }

    async getTicketById(id: number) {
        return this.ticketRepo.findOne({ where: { id } });
    }

    async saveTicketText(
        chatId: string,
        value: string,
        platform: UserPlatform = 'telegram',
    ) {
        const ticket = await this.getActiveTicket(chatId, platform);
        if (!ticket) return null;

        ticket.text = value;

        await this.ticketRepo.save(ticket);
        await this.addMessage(ticket.id, 'user', value, chatId, 'bot');

        return ticket;
    }

    async saveTicketMedia(
        chatId: string,
        media: TicketMediaInput,
        platform: UserPlatform = 'telegram',
    ) {
        const ticket = await this.getActiveTicket(chatId, platform);
        if (!ticket) return null;

        const label = this.formatMediaLabel(media);
        ticket.text = ticket.text || label;

        await this.ticketRepo.save(ticket);
        await this.addMediaMessage(ticket.id, 'user', media, chatId, 'bot');

        return ticket;
    }

    getTicketMessages(ticketId: number) {
        return this.messagesRepo.find({
            where: { ticketId },
            relations: { storedFile: true },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
    }

    getTicketMessageById(id: number) {
        return this.messagesRepo.findOne({
            where: { id },
            relations: { storedFile: true },
        });
    }

    async addMessage(
        ticketId: number,
        sender: 'user' | 'operator',
        text: string,
        authorId: string | null,
        source: 'bot' | 'admin-panel' = 'bot',
    ) {
        const message = this.messagesRepo.create({
            ticketId,
            sender,
            text,
            authorId,
            source,
            messageType: 'text',
        });

        return this.messagesRepo.save(message);
    }

    async addMediaMessage(
        ticketId: number,
        sender: TicketMessageSender,
        media: TicketMediaInput,
        authorId: string | null,
        source: TicketMessageSource = 'bot',
    ) {
        if (!media.buffer) {
            throw new Error('Ticket media must be materialized before storage');
        }
        const storedFile = await this.filesService.saveBuffer({
            purpose: this.filePurpose(media.messageType),
            buffer: media.buffer,
            originalName: media.fileName,
            mimeType: media.mimeType,
        });
        const message = this.messagesRepo.create({
            ticketId,
            sender,
            authorId,
            source,
            messageType: media.messageType,
            text: media.text || this.formatMediaLabel(media),
            storedFileId: storedFile.id,
        });

        return this.messagesRepo.save(message);
    }

    async getActualTickets() {
        return this.ticketRepo.find({
            where: { isAnswered: false },
            order: { createdAt: 'ASC' },
        });
    }

    async notifyOperatorsAboutNewTicket(ticket: TicketEntity) {
        const message = formatTicket(ticket);
        await this.adminNotificationsService.notify('tickets', message);
    }

    async notifyOperatorsAboutTicketMessage(
        ticket: TicketEntity,
        text: string,
    ) {
        await this.adminNotificationsService.notify('tickets', text);
    }

    private formatMediaLabel(media: TicketMediaInput) {
        const labels: Record<TicketMediaInput['messageType'], string> = {
            image: 'Изображение',
            video: 'Видео',
            audio: 'Аудио',
            voice: 'Голосовое сообщение',
            video_note: 'Кружок',
            document: 'Документ',
        };

        return media.fileName
            ? `${labels[media.messageType]}: ${media.fileName}`
            : labels[media.messageType];
    }

    private filePurpose(messageType: TicketMessageType): FilePurpose {
        if (messageType === 'image') return 'ticket-image';
        if (messageType === 'audio' || messageType === 'voice')
            return 'ticket-audio';
        if (messageType === 'video' || messageType === 'video_note')
            return 'ticket-video';
        return 'ticket-document';
    }
}
