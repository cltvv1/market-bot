import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';
import {
    TicketMessageEntity,
    TicketMessageSender,
    TicketMessageSource,
    TicketMessageType,
} from './entities/ticket-message.entity';
import { UsersService } from 'src/users/users.service';
import { formatTicket } from 'src/common/utils';
import type { MessengerInlineKeyboard } from 'src/messenger/messenger.types';
import { UserPlatform } from 'src/users/entities/user.entity';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { FilesService } from 'src/files/files.service';
import type { FilePurpose } from 'src/files/file-storage.types';
import { OutboundDeliveriesService } from 'src/outbound-deliveries/outbound-deliveries.service';

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

export interface CreateOrReuseTicketInput {
    userChatId: string;
    username?: string;
    name?: string;
    text?: string;
    platform?: UserPlatform;
    userId?: number;
    organizationId?: number;
}

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,
        @InjectRepository(TicketMessageEntity)
        private readonly messagesRepo: Repository<TicketMessageEntity>,

        private usersService: UsersService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly filesService: FilesService,
        private readonly dataSource: DataSource,
        private readonly outbound: OutboundDeliveriesService,
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
        const { ticket } = await this.getOrCreateActiveTicket({
            userChatId,
            username,
            name,
            text,
            platform,
            userId,
            organizationId,
        });
        return ticket;
    }

    async getOrCreateActiveTicket(
        input: CreateOrReuseTicketInput,
    ): Promise<{ ticket: TicketEntity; created: boolean }> {
        const platform = input.platform ?? 'telegram';
        return this.dataSource.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `ticket:${platform}:${input.userChatId}`,
            ]);
            const tickets = manager.getRepository(TicketEntity);
            const existing = await tickets.findOne({
                where: {
                    userChatId: input.userChatId,
                    platform,
                    isAnswered: false,
                },
                order: { createdAt: 'DESC', id: 'DESC' },
            });
            if (existing) return { ticket: existing, created: false };

            const ticket = await tickets.save(
                tickets.create({
                    userChatId: input.userChatId,
                    platform,
                    userId: input.userId,
                    organizationId: input.organizationId,
                    username: input.username,
                    name: input.name,
                    text: input.text,
                }),
            );
            if (input.text?.trim()) {
                await manager.getRepository(TicketMessageEntity).save(
                    manager.getRepository(TicketMessageEntity).create({
                        ticketId: ticket.id,
                        sender: 'user',
                        text: input.text.trim(),
                        authorId: input.userChatId,
                        source: 'bot',
                        messageType: 'text',
                    }),
                );
            }
            return { ticket, created: true };
        });
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
        return this.dataSource.transaction(async (manager) => {
            const tickets = manager.getRepository(TicketEntity);
            const ticket = await tickets.findOne({
                where: { userChatId: chatId, platform, isAnswered: false },
                order: { createdAt: 'DESC' },
                lock: { mode: 'pessimistic_write' },
            });
            if (!ticket) return null;
            const firstMessage = !ticket.text;
            ticket.text = value;
            const savedTicket = await tickets.save(ticket);
            const messages = manager.getRepository(TicketMessageEntity);
            const message = await messages.save(
                messages.create({
                    ticketId: ticket.id,
                    sender: 'user',
                    text: value,
                    authorId: chatId,
                    source: 'bot',
                    messageType: 'text',
                }),
            );
            await this.adminNotificationsService.notify(
                'tickets',
                firstMessage
                    ? formatTicket(savedTicket)
                    : `Новое сообщение клиента по вопросу #${savedTicket.id}`,
                {
                    dedupeKey: `ticket-message:${message.id}:staff`,
                    sourceType: 'ticket',
                    sourceId: savedTicket.id,
                    manager,
                },
            );
            return savedTicket;
        });
    }

    async saveTicketMedia(
        chatId: string,
        media: TicketMediaInput,
        platform: UserPlatform = 'telegram',
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
        try {
            const saved = await this.dataSource.transaction(async (manager) => {
                const tickets = manager.getRepository(TicketEntity);
                const ticket = await tickets.findOne({
                    where: {
                        userChatId: chatId,
                        platform,
                        isAnswered: false,
                    },
                    order: { createdAt: 'DESC' },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!ticket) return null;
                const label = this.formatMediaLabel(media);
                ticket.text = ticket.text || label;
                const savedTicket = await tickets.save(ticket);
                const messages = manager.getRepository(TicketMessageEntity);
                const message = await messages.save(
                    messages.create({
                        ticketId: ticket.id,
                        sender: 'user',
                        authorId: chatId,
                        source: 'bot',
                        messageType: media.messageType,
                        text: media.text || label,
                        storedFileId: storedFile.id,
                    }),
                );
                await this.adminNotificationsService.notify(
                    'tickets',
                    `Новое вложение в вопросе #${savedTicket.id}: ${media.fileName || media.messageType}`,
                    {
                        dedupeKey: `ticket-message:${message.id}:staff`,
                        sourceType: 'ticket',
                        sourceId: savedTicket.id,
                        manager,
                    },
                );
                return savedTicket;
            });
            if (!saved) await this.filesService.logicalDelete(storedFile.id);
            return saved;
        } catch (error) {
            await this.filesService.logicalDelete(storedFile.id);
            throw error;
        }
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

    async enqueueOperatorText(
        ticketId: number,
        text: string,
        authorId: string,
        source: TicketMessageSource = 'bot',
        inlineKeyboard?: MessengerInlineKeyboard,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const ticket = await manager.getRepository(TicketEntity).findOne({
                where: { id: ticketId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!ticket) return null;
            const messages = manager.getRepository(TicketMessageEntity);
            const message = await messages.save(
                messages.create({
                    ticketId,
                    sender: 'operator',
                    authorId,
                    source,
                    messageType: 'text',
                    text,
                }),
            );
            if (ticket.platform === 'telegram' || ticket.platform === 'max') {
                await this.outbound.enqueue(
                    {
                        dedupeKey: `ticket-message:${message.id}:customer`,
                        platform: ticket.platform,
                        recipientChatId: ticket.userChatId,
                        kind: 'text',
                        audience: 'customer',
                        sourceType: 'ticket',
                        sourceId: ticket.id,
                        payload: { text, inlineKeyboard },
                    },
                    { manager },
                );
            }
            return message;
        });
    }

    async enqueueOperatorMedia(
        ticketId: number,
        media: TicketMediaInput,
        authorId: string,
        source: TicketMessageSource = 'bot',
        inlineKeyboard?: MessengerInlineKeyboard,
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
        try {
            const message = await this.dataSource.transaction(
                async (manager) => {
                    const ticket = await manager
                        .getRepository(TicketEntity)
                        .findOne({
                            where: { id: ticketId },
                            lock: { mode: 'pessimistic_write' },
                        });
                    if (!ticket) return null;
                    const messages = manager.getRepository(TicketMessageEntity);
                    const saved = await messages.save(
                        messages.create({
                            ticketId,
                            sender: 'operator',
                            authorId,
                            source,
                            messageType: media.messageType,
                            text: media.text || this.formatMediaLabel(media),
                            storedFileId: storedFile.id,
                        }),
                    );
                    if (
                        ticket.platform === 'telegram' ||
                        ticket.platform === 'max'
                    ) {
                        await this.outbound.enqueue(
                            {
                                dedupeKey: `ticket-message:${saved.id}:customer`,
                                platform: ticket.platform,
                                recipientChatId: ticket.userChatId,
                                kind:
                                    media.messageType === 'image'
                                        ? 'image'
                                        : 'document',
                                audience: 'customer',
                                sourceType: 'ticket',
                                sourceId: ticket.id,
                                storedFileId: storedFile.id,
                                payload: {
                                    filename: media.fileName || 'attachment',
                                    caption: media.text,
                                    inlineKeyboard,
                                },
                            },
                            { manager },
                        );
                    }
                    return saved;
                },
            );
            if (!message) await this.filesService.logicalDelete(storedFile.id);
            return message;
        } catch (error) {
            await this.filesService.logicalDelete(storedFile.id);
            throw error;
        }
    }

    async getActualTickets() {
        return this.ticketRepo.find({
            where: { isAnswered: false },
            order: { createdAt: 'ASC' },
        });
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
