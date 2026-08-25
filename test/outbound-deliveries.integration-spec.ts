/* eslint-disable @typescript-eslint/unbound-method */
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import testDataSource from '../src/database/test-data-source';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import type { FilesService } from '../src/files/files.service';
import type { MessengerService } from '../src/messenger/messenger.types';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { OutboundDeliveryProcessor } from '../src/outbound-deliveries/outbound-delivery.processor';
import { OutboundDeliveriesService } from '../src/outbound-deliveries/outbound-deliveries.service';
import { StaffNotificationAuthorizationService } from '../src/outbound-deliveries/staff-notification-authorization.service';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { TicketEntity } from '../src/tickets/entities/ticket.entity';
import { TicketMessageEntity } from '../src/tickets/entities/ticket-message.entity';
import { TicketsService } from '../src/tickets/tickets.service';
import { UserEntity } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';

describe('durable outbound delivery on migrated PostgreSQL', () => {
    let dataSource: DataSource;
    let outbound: OutboundDeliveriesService;
    let processor: OutboundDeliveryProcessor;
    let staffAuthorization: StaffNotificationAuthorizationService;

    const messenger: jest.Mocked<MessengerService> = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 101 }),
        sendImage: jest.fn().mockResolvedValue({ message_id: 102 }),
        sendDocument: jest.fn().mockResolvedValue({ message_id: 103 }),
    };
    const files = {
        open: jest.fn(),
    };
    const config = new ConfigService({
        OUTBOUND_DELIVERY_WORKER_ENABLED: false,
    });

    beforeAll(async () => {
        dataSource = testDataSource;
        if (!dataSource.isInitialized) await dataSource.initialize();
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations'`,
        );
        const names = tables
            .map(
                ({ table_name }) =>
                    `"public"."${table_name.replaceAll('"', '""')}"`,
            )
            .join(', ');
        await dataSource.query(
            `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
        );
        jest.clearAllMocks();
        messenger.sendMessage.mockResolvedValue({ message_id: 101 });
        messenger.sendImage.mockResolvedValue({ message_id: 102 });
        messenger.sendDocument.mockResolvedValue({ message_id: 103 });
        files.open.mockImplementation(async (id: number) => ({
            file: await dataSource
                .getRepository(StoredFileEntity)
                .findOneByOrFail({ id }),
            stream: Readable.from(Buffer.from('%PDF-test')),
        }));
        outbound = new OutboundDeliveriesService(
            dataSource.getRepository(OutboundDeliveryEntity),
            dataSource,
        );
        staffAuthorization = new StaffNotificationAuthorizationService(
            dataSource.getRepository(AdminUserEntity),
            dataSource.getRepository(RegistrationRequestEntity),
            dataSource.getRepository(ServiceRequestEntity),
            dataSource.getRepository(TicketEntity),
        );
        processor = new OutboundDeliveryProcessor(
            outbound,
            staffAuthorization,
            files as unknown as FilesService,
            messenger,
            config,
        );
    });

    afterAll(async () => {
        if (dataSource.isInitialized) await dataSource.destroy();
    });

    it('commits and rolls back a domain mutation with its delivery intent atomically', async () => {
        const ticket = await dataSource.getRepository(TicketEntity).save({
            userChatId: 'atomic-client',
            platform: 'telegram',
            isAnswered: false,
        });

        await dataSource.transaction(async (manager) => {
            ticket.text = 'committed';
            await manager.save(TicketEntity, ticket);
            await outbound.enqueue(textIntent('atomic:commit', ticket.id), {
                manager,
            });
        });
        expect(
            await dataSource.getRepository(TicketEntity).findOneByOrFail({
                id: ticket.id,
            }),
        ).toMatchObject({ text: 'committed' });
        expect(await outbound.repository.count()).toBe(1);

        await expect(
            dataSource.transaction(async (manager) => {
                const locked = await manager.findOneByOrFail(TicketEntity, {
                    id: ticket.id,
                });
                locked.text = 'rolled back';
                await manager.save(TicketEntity, locked);
                await outbound.enqueue(
                    textIntent('atomic:rollback', ticket.id),
                    {
                        manager,
                    },
                );
                throw new Error('forced rollback');
            }),
        ).rejects.toThrow('forced rollback');
        expect(
            await dataSource.getRepository(TicketEntity).findOneByOrFail({
                id: ticket.id,
            }),
        ).toMatchObject({ text: 'committed' });
        expect(
            await outbound.repository.countBy({ dedupeKey: 'atomic:rollback' }),
        ).toBe(0);
    });

    it('deduplicates one logical enqueue without changing its identity', async () => {
        const first = await outbound.enqueue(textIntent('dedupe:one', 1));
        const second = await outbound.enqueue(textIntent('dedupe:one', 1));

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.delivery.id).toBe(first.delivery.id);
        expect(await outbound.repository.count()).toBe(1);
        await expect(
            outbound.enqueue({
                ...textIntent('dedupe:one', 1),
                payload: { text: 'Другое сообщение' },
            }),
        ).rejects.toThrow('refers to another intent');
    });

    it('moves a successful delivery from pending to sent', async () => {
        const { delivery } = await outbound.enqueue(
            textIntent('success:one', 1),
        );

        expect(await processor.processBatch(new Date())).toBe(1);
        const sent = await outbound.get(delivery.id);
        expect(sent).toMatchObject({
            status: 'sent',
            attemptCount: 1,
            providerMessageId: '101',
            lastError: null,
        });
        expect(messenger.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('persists a transient failure and succeeds on a bounded retry', async () => {
        messenger.sendMessage
            .mockRejectedValueOnce(new Error('temporary provider outage'))
            .mockResolvedValueOnce({ message_id: 202 });
        const { delivery } = await outbound.enqueue(
            textIntent('retry:success', 1),
        );

        await processor.processBatch(new Date());
        let current = await outbound.get(delivery.id);
        expect(current).toMatchObject({ status: 'retrying', attemptCount: 1 });
        await outbound.repository.update(delivery.id, {
            nextAttemptAt: new Date(0),
        });
        await processor.processBatch(new Date());
        current = await outbound.get(delivery.id);
        expect(current).toMatchObject({
            status: 'sent',
            attemptCount: 2,
            providerMessageId: '202',
        });
        expect(messenger.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('keeps a terminal failure for operator diagnostics after four attempts', async () => {
        messenger.sendMessage.mockRejectedValue(new Error('provider offline'));
        const { delivery } = await outbound.enqueue(
            textIntent('retry:terminal', 1),
        );

        for (let attempt = 1; attempt <= 4; attempt += 1) {
            await processor.processBatch(new Date());
            await outbound.repository.update(delivery.id, {
                nextAttemptAt: new Date(0),
            });
        }
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'failed',
            attemptCount: 4,
            lastError: 'provider offline',
        });
        expect(messenger.sendMessage).toHaveBeenCalledTimes(4);
    });

    it('allows only one concurrent worker to claim a delivery', async () => {
        let releaseProvider!: () => void;
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => (markStarted = resolve));
        messenger.sendMessage.mockImplementation(
            () =>
                new Promise((resolve) => {
                    markStarted();
                    releaseProvider = () => resolve({ message_id: 303 });
                }),
        );
        await outbound.enqueue(textIntent('concurrency:one', 1));
        const secondProcessor = new OutboundDeliveryProcessor(
            outbound,
            staffAuthorization,
            files as unknown as FilesService,
            messenger,
            config,
        );

        const firstRun = processor.processBatch(new Date());
        await started;
        expect(await secondProcessor.processBatch(new Date())).toBe(0);
        releaseProvider();
        await firstRun;
        expect(messenger.sendMessage).toHaveBeenCalledTimes(1);
        expect(
            await outbound.repository.findOneByOrFail({ id: 1 }),
        ).toMatchObject({ status: 'sent', attemptCount: 1 });
    });

    it('recovers a stale processing claim without losing attempt accounting', async () => {
        const { delivery } = await outbound.enqueue(
            textIntent('stale:recover', 1),
        );
        await outbound.repository.update(delivery.id, {
            status: 'processing',
            attemptCount: 1,
            claimedAt: new Date(Date.now() - 10 * 60_000),
            claimToken: '11111111-1111-4111-8111-111111111111',
        });

        await processor.processBatch(new Date());
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'sent',
            attemptCount: 2,
        });
        expect(messenger.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('fails an exhausted stale claim without a fifth provider attempt', async () => {
        const { delivery } = await outbound.enqueue(
            textIntent('stale:exhausted', 1),
        );
        await outbound.repository.update(delivery.id, {
            status: 'processing',
            attemptCount: 4,
            claimedAt: new Date(Date.now() - 10 * 60_000),
            claimToken: '33333333-3333-4333-8333-333333333333',
        });

        expect(await processor.processBatch(new Date())).toBe(0);
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'failed',
            attemptCount: 4,
            claimedAt: null,
            claimToken: null,
        });
        expect(messenger.sendMessage).not.toHaveBeenCalled();
    });

    it('documents at-least-once behavior for an indeterminate post-send crash', async () => {
        const { delivery } = await outbound.enqueue(
            textIntent('indeterminate:post-send', 1),
        );
        jest.spyOn(outbound.repository, 'update').mockRejectedValueOnce(
            new Error('simulated sent-state persistence crash'),
        );

        await processor.processBatch(new Date());
        expect(messenger.sendMessage).toHaveBeenCalledTimes(1);
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'processing',
            attemptCount: 1,
        });
        await outbound.repository.update(delivery.id, {
            claimedAt: new Date(Date.now() - 10 * 60_000),
        });

        await processor.processBatch(new Date());
        expect(messenger.sendMessage).toHaveBeenCalledTimes(2);
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'sent',
            attemptCount: 2,
        });
    });

    it('sends a StoredFile document without persisting provider URLs', async () => {
        const storedFile = await createStoredFile('invoice.pdf');
        const { delivery } = await outbound.enqueue({
            dedupeKey: 'document:one',
            platform: 'max',
            recipientChatId: 'document-client',
            kind: 'document',
            audience: 'customer',
            sourceType: 'service_request',
            sourceId: 9,
            storedFileId: storedFile.id,
            payload: { filename: 'invoice.pdf', caption: 'Ваш счет' },
        });

        expect(JSON.stringify(delivery)).not.toContain('http');
        await processor.processBatch(new Date());
        expect(files.open).toHaveBeenCalledWith(storedFile.id);
        expect(messenger.sendDocument).toHaveBeenCalledWith(
            'document-client',
            expect.objectContaining({ filename: 'invoice.pdf' }),
            expect.objectContaining({ platform: 'max', caption: 'Ваш счет' }),
        );
        expect(await outbound.get(delivery.id)).toMatchObject({
            status: 'sent',
        });
    });

    it('creates independent durable rows for every staff recipient and platform', async () => {
        const admins = dataSource.getRepository(AdminUserEntity);
        const staff = await admins.save([
            admins.create({
                login: 'staff-one',
                displayName: 'Staff One',
                passwordHash: 'hash',
                telegramChatId: 'tg-one',
                maxChatId: 'max-one',
                isActive: true,
                notifyTickets: true,
            }),
            admins.create({
                login: 'staff-two',
                displayName: 'Staff Two',
                passwordHash: 'hash',
                maxChatId: 'max-two',
                isActive: true,
                notifyTickets: true,
            }),
        ]);
        await dataSource
            .getRepository(AdminUserRoleEntity)
            .save(
                staff.map((admin) => ({ userId: admin.id, role: 'operator' })),
            );
        const ticket = await dataSource.getRepository(TicketEntity).save({
            userChatId: 'staff-fanout-client',
            platform: 'telegram',
            isAnswered: false,
        });
        const notifications = new AdminNotificationsService(
            admins,
            outbound,
            staffAuthorization,
        );

        await notifications.notify('tickets', 'Новый вопрос', {
            dedupeKey: 'ticket:77:created',
            sourceType: 'ticket',
            sourceId: ticket.id,
        });

        const deliveries = await outbound.repository.find({
            order: { id: 'ASC' },
        });
        expect(deliveries).toHaveLength(3);
        expect(deliveries.map((item) => item.status)).toEqual([
            'pending',
            'pending',
            'pending',
        ]);
        expect(new Set(deliveries.map((item) => item.dedupeKey)).size).toBe(3);
        expect(messenger.sendMessage).not.toHaveBeenCalled();
    });

    it('rolls ticket history and staff delivery back together', async () => {
        const admins = dataSource.getRepository(AdminUserEntity);
        const staff = await admins.save(
            admins.create({
                login: 'ticket-staff',
                displayName: 'Ticket Staff',
                passwordHash: 'hash',
                telegramChatId: 'ticket-staff-chat',
                isActive: true,
                notifyTickets: true,
            }),
        );
        await dataSource.getRepository(AdminUserRoleEntity).save({
            userId: staff.id,
            role: 'operator',
        });
        const notifications = new AdminNotificationsService(
            admins,
            outbound,
            staffAuthorization,
        );
        const tickets = new TicketsService(
            dataSource.getRepository(TicketEntity),
            dataSource.getRepository(TicketMessageEntity),
            new UsersService(dataSource.getRepository(UserEntity)),
            notifications,
            files as unknown as FilesService,
            dataSource,
            outbound,
        );
        const { ticket } = await tickets.getOrCreateActiveTicket({
            userChatId: 'ticket-client',
            platform: 'telegram',
        });
        jest.spyOn(outbound, 'enqueue').mockRejectedValueOnce(
            new Error('forced staff enqueue rollback'),
        );

        await expect(
            tickets.saveTicketText(
                'ticket-client',
                'Первый вопрос',
                'telegram',
            ),
        ).rejects.toThrow('forced staff enqueue rollback');
        expect(
            await dataSource
                .getRepository(TicketMessageEntity)
                .countBy({ ticketId: ticket.id }),
        ).toBe(0);
        expect(
            await dataSource
                .getRepository(TicketEntity)
                .findOneByOrFail({ id: ticket.id }),
        ).toMatchObject({ text: null });
        expect(await outbound.repository.count()).toBe(0);

        await tickets.saveTicketText(
            'ticket-client',
            'Первый вопрос',
            'telegram',
        );
        expect(
            await dataSource
                .getRepository(TicketMessageEntity)
                .countBy({ ticketId: ticket.id }),
        ).toBe(1);
        expect(
            await outbound.repository.findOneByOrFail({ id: 1 }),
        ).toMatchObject({
            sourceType: 'ticket',
            sourceId: String(ticket.id),
            audience: 'staff',
            status: 'pending',
        });
    });

    it('redacts token-bearing URLs from persisted provider errors', async () => {
        messenger.sendMessage.mockRejectedValue(
            new Error(
                'POST https://api.telegram.org/bot123456:secret/sendMessage?token=secret failed',
            ),
        );
        const { delivery } = await outbound.enqueue(
            textIntent('error:redaction', 1),
        );

        await processor.processBatch(new Date());
        const failed = await outbound.get(delivery.id);
        expect(failed?.lastError).toContain('[redacted-url]');
        expect(failed?.lastError).not.toContain('secret');
    });

    function textIntent(dedupeKey: string, sourceId: number) {
        return {
            dedupeKey,
            platform: 'telegram' as const,
            recipientChatId: 'customer-chat',
            kind: 'text' as const,
            audience: 'customer' as const,
            sourceType: 'ticket',
            sourceId,
            payload: { text: 'Сообщение клиенту' },
        };
    }

    function createStoredFile(originalName: string) {
        return dataSource.getRepository(StoredFileEntity).save({
            provider: 'local',
            objectKey: `outbound-test/${originalName}`,
            originalName,
            mimeType: 'application/pdf',
            sizeBytes: '9',
            sha256: 'a'.repeat(64),
            status: 'active',
            metadata: { purpose: 'service-invoice' },
        });
    }
});
