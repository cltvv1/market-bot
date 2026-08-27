import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuditService } from 'src/audit/audit.service';
import { getPermissions } from 'src/admin/admin.permissions';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { OrganizationsService } from 'src/organizations/organizations.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import {
    Brackets,
    DataSource,
    EntityManager,
    In,
    QueryFailedError,
} from 'typeorm';
import type {
    AdminOrderListQueryDto,
    AssignOrderDto,
    ClientOrderListQueryDto,
    OrderExpectedVersionDto,
    SubmitOrderDto,
    UpdateOrderQuoteDto,
} from './dto/order.dto';
import { OrderEventEntity } from './entities/order-event.entity';
import { OrderLineEntity } from './entities/order-line.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderQuoteEntity } from './entities/order-quote.entity';
import { OrderQuoteLineEntity } from './entities/order-quote-line.entity';
import {
    calculateCatalogTotals,
    formatOrderNumber,
    multiplyMinorUnits,
    normalizeLinkedOrganizationSnapshot,
    normalizeOrderSubmission,
    orderAdvisoryLockKey,
    orderSubmissionFingerprint,
    type NormalizedOrderSubmission,
} from './order-intake';
import {
    calculateQuoteTotals,
    assertExpectedOrderVersion,
    canAssignOrder,
    canConfirmOrder,
    canStartOrderReview,
    canUpdateOrderQuote,
    initialQuoteLine,
    normalizeQuotedPrice,
    nextQuoteRevision,
    quoteLineFromOriginal,
    quoteLineFromProduct,
    type QuoteLineSnapshot,
} from './order-quote';
import { ORDER_PAGE_SIZE_DEFAULT, POSTGRES_INTEGER_MAX } from './order.types';

interface OrderOrganizationSnapshot {
    organizationId: number | null;
    name: string | null;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    legalAddress: string | null;
    actualAddress: string | null;
    taxSystem: string | null;
}

@Injectable()
export class OrdersService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly organizations: OrganizationsService,
        private readonly audit: AuditService,
    ) {}

    async submit(
        input: SubmitOrderDto,
        suppliedIdempotencyKey: string | undefined,
        session: WebSessionPrincipal,
        requestId?: string,
    ) {
        const idempotencyKey = this.normalizeIdempotencyKey(
            suppliedIdempotencyKey,
        );
        const normalized = normalizeOrderSubmission(input, (inn) =>
            this.organizations.normalizeInn(inn),
        );
        const submissionFingerprint = orderSubmissionFingerprint(normalized);

        try {
            const order = await this.dataSource.transaction(async (manager) => {
                await manager.query(
                    'SELECT pg_advisory_xact_lock($1::bigint)',
                    [orderAdvisoryLockKey(session.userId, idempotencyKey)],
                );

                const orders = manager.getRepository(OrderEntity);
                const existing = await orders.findOne({
                    where: {
                        createdByUserId: session.userId,
                        idempotencyKey,
                    },
                });
                if (existing) {
                    if (
                        existing.submissionFingerprint !== submissionFingerprint
                    ) {
                        throw new ConflictException(
                            'Idempotency key was already used for another order',
                        );
                    }
                    return this.loadOrder(manager, existing.id);
                }

                const organization = await this.resolveOrganization(
                    manager,
                    session.userId,
                    normalized,
                );
                const products = await this.loadEligibleProducts(
                    manager,
                    normalized.items.map((item) => item.productId),
                );
                const productById = new Map(
                    products.map((product) => [product.id, product]),
                );
                const lineSnapshots = normalized.items.map((item, position) => {
                    const product = productById.get(item.productId);
                    if (!product) {
                        throw new ConflictException(
                            'One or more products are unavailable',
                        );
                    }
                    const unitPrice =
                        product.displayPriceMinor === null
                            ? null
                            : String(product.displayPriceMinor);
                    return {
                        product,
                        position,
                        quantity: item.quantity,
                        catalogUnitPriceMinor: unitPrice,
                        catalogLineTotalMinor:
                            unitPrice === null
                                ? null
                                : multiplyMinorUnits(unitPrice, item.quantity),
                    };
                });
                const totals = calculateCatalogTotals(lineSnapshots);

                const order = await orders.save(
                    orders.create({
                        createdByUserId: session.userId,
                        idempotencyKey,
                        submissionFingerprint,
                        status: 'submitted',
                        customerType: normalized.customerType,
                        organizationId: organization.organizationId,
                        organizationNameSnapshot: organization.name,
                        organizationInnSnapshot: organization.inn,
                        organizationKppSnapshot: organization.kpp,
                        organizationOgrnSnapshot: organization.ogrn,
                        organizationLegalAddressSnapshot:
                            organization.legalAddress,
                        organizationActualAddressSnapshot:
                            organization.actualAddress,
                        organizationTaxSystemSnapshot: organization.taxSystem,
                        contactNameSnapshot: normalized.contact.name,
                        contactPhoneSnapshot: normalized.contact.phone,
                        contactEmailSnapshot: normalized.contact.email,
                        deliveryType: normalized.delivery.type,
                        deliveryCitySnapshot: normalized.delivery.city,
                        deliveryAddressSnapshot: normalized.delivery.address,
                        deliveryCommentSnapshot: normalized.delivery.comment,
                        customerComment: normalized.comment,
                        catalogPricedSubtotalMinor:
                            totals.catalogPricedSubtotalMinor,
                        hasUnpricedItems: totals.hasUnpricedItems,
                        currency: 'RUB',
                    }),
                );

                const lines = manager.getRepository(OrderLineEntity);
                await lines.save(
                    lineSnapshots.map((line) =>
                        lines.create({
                            orderId: order.id,
                            productId: line.product.id,
                            position: line.position,
                            skuSnapshot: line.product.sku,
                            slugSnapshot: line.product.slug,
                            nameSnapshot: line.product.name,
                            brandSnapshot: line.product.brand,
                            catalogUnitPriceMinor: line.catalogUnitPriceMinor,
                            vatRateSnapshot: line.product.vatRate,
                            quantity: line.quantity,
                            catalogLineTotalMinor: line.catalogLineTotalMinor,
                        }),
                    ),
                );

                const events = manager.getRepository(OrderEventEntity);
                await events.save(
                    events.create({
                        orderId: order.id,
                        type: 'submitted',
                        fromStatus: null,
                        toStatus: 'submitted',
                        actorType: 'customer',
                        actorUserId: session.userId,
                        actorStaffId: null,
                        visibility: 'customer',
                        message: null,
                        metadata: null,
                    }),
                );
                await this.audit.record(
                    {
                        actorType: 'customer',
                        actorCustomerId: session.userId,
                        actorWebSessionId: session.sessionId,
                        action: 'order.submitted',
                        targetType: 'order',
                        targetId: order.id,
                        requestId:
                            requestId && isUUID(requestId)
                                ? requestId
                                : undefined,
                        metadata: {
                            orderNumber: formatOrderNumber(order.id),
                            customerType: order.customerType,
                            ...(order.organizationId !== null
                                ? { organizationId: order.organizationId }
                                : {}),
                            lineCount: lineSnapshots.length,
                            hasUnpricedItems: order.hasUnpricedItems,
                        },
                    },
                    manager,
                );
                return this.loadOrder(manager, order.id);
            });
            return this.presentDetail(order, false);
        } catch (error) {
            if (isOrderPersistenceConflict(error)) {
                throw new ConflictException('Order could not be submitted');
            }
            throw error;
        }
    }

    async listClient(userId: number, query: ClientOrderListQueryDto) {
        const { page, limit } = this.pagination(query);
        const builder = this.dataSource
            .getRepository(OrderEntity)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.quote', 'quote')
            .where('order.createdByUserId = :userId', { userId });
        if (query.status) {
            builder.andWhere('order.status = :status', {
                status: query.status,
            });
        }
        const [orders, total] = await builder
            .orderBy('order.createdAt', 'DESC')
            .addOrderBy('order.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        const counts = await this.lineCounts(orders.map((order) => order.id));
        return {
            items: orders.map((order) =>
                this.presentSummary(order, counts.get(order.id) ?? 0, false),
            ),
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    async getClient(userId: number, id: number) {
        const order = await this.dataSource.getRepository(OrderEntity).findOne({
            where: { id, createdByUserId: userId },
            relations: { lines: true, events: true, quote: { lines: true } },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return this.presentDetail(order, false);
    }

    async listAdmin(query: AdminOrderListQueryDto, admin: AdminPrincipal) {
        const { page, limit } = this.pagination(query);
        const builder = this.dataSource
            .getRepository(OrderEntity)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.assignedManager', 'assignedManager')
            .leftJoinAndSelect('order.quote', 'quote');
        if (query.scope === 'mine') {
            builder.andWhere('order.assignedManagerId = :managerId', {
                managerId: admin.id,
            });
        } else if (query.scope === 'unassigned') {
            builder.andWhere('order.assignedManagerId IS NULL');
        }
        if (query.status) {
            builder.andWhere('order.status = :status', {
                status: query.status,
            });
        }
        const search = query.search?.trim();
        if (search) {
            const orderId = this.parseOrderNumber(search);
            const pattern = `%${this.escapeLike(search)}%`;
            builder.andWhere(
                new Brackets((where) => {
                    if (orderId !== null) {
                        where.where('order.id = :orderId', { orderId });
                    } else {
                        where.where('FALSE');
                    }
                    where
                        .orWhere(
                            `order.organizationInnSnapshot ILIKE :pattern ESCAPE '\\'`,
                            { pattern },
                        )
                        .orWhere(
                            `order.organizationNameSnapshot ILIKE :pattern ESCAPE '\\'`,
                            { pattern },
                        )
                        .orWhere(
                            `order.contactPhoneSnapshot ILIKE :pattern ESCAPE '\\'`,
                            { pattern },
                        )
                        .orWhere(
                            `order.contactEmailSnapshot ILIKE :pattern ESCAPE '\\'`,
                            { pattern },
                        );
                }),
            );
        }
        const [orders, total] = await builder
            .orderBy('order.createdAt', 'DESC')
            .addOrderBy('order.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        const counts = await this.lineCounts(orders.map((order) => order.id));
        return {
            items: orders.map((order) =>
                this.presentSummary(order, counts.get(order.id) ?? 0, true),
            ),
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    async getAdmin(id: number) {
        const order = await this.dataSource.getRepository(OrderEntity).findOne({
            where: { id },
            relations: {
                lines: true,
                events: true,
                assignedManager: true,
                quote: {
                    lines: true,
                    createdByStaff: true,
                    updatedByStaff: true,
                    confirmedByStaff: true,
                },
            },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return this.presentDetail(order, true);
    }

    async assign(
        id: number,
        input: AssignOrderDto,
        actor: AdminPrincipal,
        requestId?: string,
    ) {
        return this.executeCommand(async (manager) => {
            const order = await this.lockOrder(manager, id);
            this.assertExpectedVersion(order, input.expectedVersion);
            if (!canAssignOrder(order.status)) {
                throw new ConflictException(
                    'Order cannot be assigned in its current state',
                );
            }
            const target = await this.requireEligibleManager(
                manager,
                input.managerId,
            );
            if (order.assignedManagerId === target.id) {
                return this.presentDetail(
                    await this.loadOrder(manager, order.id),
                    true,
                );
            }

            const previousManagerId = order.assignedManagerId;
            const assignedAt = new Date();
            await this.updateOrder(manager, order, {
                assignedManagerId: target.id,
                assignedAt,
            });
            const reassignment = previousManagerId !== null;
            await this.recordStaffEvent(manager, order.id, actor.id, {
                type: reassignment ? 'manager_reassigned' : 'manager_assigned',
                fromStatus: order.status,
                toStatus: order.status,
                visibility: 'staff',
                metadata: {
                    managerId: target.id,
                    ...(previousManagerId === null
                        ? {}
                        : { previousManagerId }),
                },
            });
            await this.auditStaff(
                manager,
                actor,
                reassignment
                    ? 'order.manager.reassigned'
                    : 'order.manager.assigned',
                order,
                requestId,
                {
                    managerId: target.id,
                    ...(previousManagerId === null
                        ? {}
                        : { previousManagerId }),
                },
            );
            return this.presentDetail(
                await this.loadOrder(manager, order.id),
                true,
            );
        });
    }

    async startReview(
        id: number,
        input: OrderExpectedVersionDto,
        actor: AdminPrincipal,
        requestId?: string,
    ) {
        return this.executeCommand(async (manager) => {
            const order = await this.lockOrder(manager, id);
            this.assertExpectedVersion(order, input.expectedVersion);
            if (order.status === 'in_review') {
                this.assertAssignedManager(order, actor.id);
                const quote = await manager
                    .getRepository(OrderQuoteEntity)
                    .findOne({ where: { orderId: order.id } });
                if (!quote) {
                    throw new ConflictException('Order quote is missing');
                }
                return this.presentDetail(
                    await this.loadOrder(manager, order.id),
                    true,
                );
            }
            if (!canStartOrderReview(order.status)) {
                throw new ConflictException(
                    'Order review cannot be started in its current state',
                );
            }
            if (
                order.assignedManagerId !== null &&
                order.assignedManagerId !== actor.id
            ) {
                throw new ConflictException(
                    'Order is assigned to another manager',
                );
            }

            const originalLines = await manager
                .getRepository(OrderLineEntity)
                .find({
                    where: { orderId: order.id },
                    order: { position: 'ASC', id: 'ASC' },
                });
            if (!originalLines.length) {
                throw new ConflictException('Order has no lines');
            }
            const snapshots = originalLines.map((line) =>
                initialQuoteLine(line),
            );
            const totals = calculateQuoteTotals(snapshots);
            const quotes = manager.getRepository(OrderQuoteEntity);
            const quote = await quotes.save(
                quotes.create({
                    orderId: order.id,
                    status: 'draft',
                    revision: 1,
                    catalogPricedSubtotalMinor:
                        totals.catalogPricedSubtotalMinor,
                    quotedPricedSubtotalMinor: totals.quotedPricedSubtotalMinor,
                    hasUnpricedItems: totals.hasUnpricedItems,
                    currency: 'RUB',
                    internalComment: null,
                    createdByStaffId: actor.id,
                    updatedByStaffId: actor.id,
                    confirmedByStaffId: null,
                    confirmedAt: null,
                }),
            );
            await this.replaceQuoteLines(manager, quote.id, snapshots);

            const assignedAt = order.assignedAt ?? new Date();
            await this.updateOrder(manager, order, {
                status: 'in_review',
                assignedManagerId: actor.id,
                assignedAt,
            });
            await this.recordStaffEvent(manager, order.id, actor.id, {
                type: 'review_started',
                fromStatus: 'submitted',
                toStatus: 'in_review',
                visibility: 'customer',
                metadata: { quoteId: quote.id, revision: quote.revision },
            });
            await this.auditStaff(
                manager,
                actor,
                'order.review.started',
                order,
                requestId,
                { quoteId: quote.id, revision: quote.revision },
            );
            return this.presentDetail(
                await this.loadOrder(manager, order.id),
                true,
            );
        });
    }

    async updateQuote(
        id: number,
        input: UpdateOrderQuoteDto,
        actor: AdminPrincipal,
        requestId?: string,
    ) {
        const productIds = input.lines.map((line) => line.productId);
        if (new Set(productIds).size !== productIds.length) {
            throw new BadRequestException(
                'A product can appear only once in an order quote',
            );
        }
        const normalizedLines = input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            quotedUnitPriceMinor: normalizeQuotedPrice(
                line.quotedUnitPriceMinor,
            ),
        }));
        const internalComment = input.internalComment?.trim() || null;

        return this.executeCommand(async (manager) => {
            const order = await this.lockOrder(manager, id);
            this.assertExpectedVersion(order, input.expectedVersion);
            if (order.status !== 'in_review') {
                throw new ConflictException(
                    'Order quote cannot be changed in its current state',
                );
            }
            this.assertAssignedManager(order, actor.id);
            const quote = await this.lockQuote(manager, order.id);
            if (!canUpdateOrderQuote(order.status, quote.status)) {
                throw new ConflictException(
                    quote.status === 'confirmed'
                        ? 'Confirmed quote is immutable'
                        : 'Order quote cannot be changed in its current state',
                );
            }

            const originalLines = await manager
                .getRepository(OrderLineEntity)
                .find({ where: { orderId: order.id } });
            const originalByProduct = new Map(
                originalLines.map((line) => [line.productId, line]),
            );
            const addedIds = productIds.filter(
                (productId) => !originalByProduct.has(productId),
            );
            const addedProducts = addedIds.length
                ? await manager.getRepository(CatalogProductEntity).find({
                      where: { id: In(addedIds) },
                  })
                : [];
            const addedById = new Map(
                addedProducts.map((product) => [product.id, product]),
            );
            if (
                addedProducts.length !== addedIds.length ||
                addedProducts.some(
                    (product) =>
                        !product.isActive ||
                        product.availabilityStatus === 'unavailable',
                )
            ) {
                throw new ConflictException(
                    'One or more quote products are unavailable',
                );
            }

            const snapshots = normalizedLines.map((line, position) => {
                const original = originalByProduct.get(line.productId);
                if (original) {
                    return quoteLineFromOriginal(
                        original,
                        position,
                        line.quantity,
                        line.quotedUnitPriceMinor,
                    );
                }
                const product = addedById.get(line.productId);
                if (!product) {
                    throw new ConflictException(
                        'One or more quote products are unavailable',
                    );
                }
                return quoteLineFromProduct(
                    product,
                    position,
                    line.quantity,
                    line.quotedUnitPriceMinor,
                );
            });
            const totals = calculateQuoteTotals(snapshots);

            await this.replaceQuoteLines(manager, quote.id, snapshots);
            quote.revision = nextQuoteRevision(quote.revision);
            quote.catalogPricedSubtotalMinor =
                totals.catalogPricedSubtotalMinor;
            quote.quotedPricedSubtotalMinor = totals.quotedPricedSubtotalMinor;
            quote.hasUnpricedItems = totals.hasUnpricedItems;
            quote.internalComment = internalComment;
            quote.updatedByStaffId = actor.id;
            await manager.getRepository(OrderQuoteEntity).save(quote);
            await this.updateOrder(manager, order, {});

            const metadata = {
                quoteId: quote.id,
                revision: quote.revision,
                lineCount: snapshots.length,
                hasUnpricedItems: quote.hasUnpricedItems,
                quotedPricedSubtotalMinor: quote.quotedPricedSubtotalMinor,
            };
            await this.recordStaffEvent(manager, order.id, actor.id, {
                type: 'quote_updated',
                fromStatus: 'in_review',
                toStatus: 'in_review',
                visibility: 'staff',
                metadata,
            });
            await this.auditStaff(
                manager,
                actor,
                'order.quote.updated',
                order,
                requestId,
                metadata,
            );
            return this.presentDetail(
                await this.loadOrder(manager, order.id),
                true,
            );
        });
    }

    async confirm(
        id: number,
        input: OrderExpectedVersionDto,
        actor: AdminPrincipal,
        requestId?: string,
    ) {
        return this.executeCommand(async (manager) => {
            const order = await this.lockOrder(manager, id);
            this.assertExpectedVersion(order, input.expectedVersion);
            if (order.status !== 'in_review') {
                throw new ConflictException(
                    'Order cannot be confirmed in its current state',
                );
            }
            this.assertAssignedManager(order, actor.id);
            const quote = await this.lockQuote(manager, order.id);
            if (!canConfirmOrder(order.status, quote.status)) {
                throw new ConflictException(
                    quote.status === 'confirmed'
                        ? 'Confirmed quote is immutable'
                        : 'Order cannot be confirmed in its current state',
                );
            }
            const lines = await manager
                .getRepository(OrderQuoteLineEntity)
                .find({
                    where: { quoteId: quote.id },
                    order: { position: 'ASC', id: 'ASC' },
                });
            if (
                !lines.length ||
                lines.some((line) => line.quotedUnitPriceMinor === null)
            ) {
                throw new ConflictException(
                    'All quote lines must have an agreed price',
                );
            }
            const totals = calculateQuoteTotals(lines);
            if (
                quote.hasUnpricedItems ||
                totals.hasUnpricedItems ||
                totals.quotedPricedSubtotalMinor !==
                    quote.quotedPricedSubtotalMinor ||
                totals.catalogPricedSubtotalMinor !==
                    quote.catalogPricedSubtotalMinor
            ) {
                throw new ConflictException('Order quote totals are invalid');
            }

            const confirmedAt = new Date();
            quote.status = 'confirmed';
            quote.hasUnpricedItems = false;
            quote.confirmedByStaffId = actor.id;
            quote.confirmedAt = confirmedAt;
            quote.updatedByStaffId = actor.id;
            await manager.getRepository(OrderQuoteEntity).save(quote);
            await this.updateOrder(manager, order, {
                status: 'confirmed',
                confirmedAt,
            });

            const metadata = {
                quoteId: quote.id,
                quoteRevision: quote.revision,
                lineCount: lines.length,
                quotedTotalMinor: totals.quotedTotalMinor,
                currency: quote.currency,
            };
            await this.recordStaffEvent(manager, order.id, actor.id, {
                type: 'confirmed',
                fromStatus: 'in_review',
                toStatus: 'confirmed',
                visibility: 'customer',
                metadata,
            });
            await this.auditStaff(
                manager,
                actor,
                'order.confirmed',
                order,
                requestId,
                { ...metadata, managerId: actor.id },
            );
            return this.presentDetail(
                await this.loadOrder(manager, order.id),
                true,
            );
        });
    }

    private async executeCommand<T>(
        operation: (manager: EntityManager) => Promise<T>,
    ): Promise<T> {
        try {
            return await this.dataSource.transaction(operation);
        } catch (error) {
            if (isOrderPersistenceConflict(error)) {
                throw new ConflictException('Order could not be updated');
            }
            throw error;
        }
    }

    private async lockOrder(manager: EntityManager, id: number) {
        const order = await manager.getRepository(OrderEntity).findOne({
            where: { id },
            lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return order;
    }

    private async lockQuote(manager: EntityManager, orderId: number) {
        const quote = await manager.getRepository(OrderQuoteEntity).findOne({
            where: { orderId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!quote) throw new ConflictException('Order quote is missing');
        return quote;
    }

    private assertExpectedVersion(order: OrderEntity, expectedVersion: number) {
        assertExpectedOrderVersion(order.version, expectedVersion);
    }

    private assertAssignedManager(order: OrderEntity, actorId: number) {
        if (order.assignedManagerId !== actorId) {
            throw new ConflictException('Order is assigned to another manager');
        }
    }

    private async requireEligibleManager(
        manager: EntityManager,
        managerId: number,
    ) {
        const target = await manager.getRepository(AdminUserEntity).findOne({
            where: { id: managerId },
            relations: { roleAssignments: true },
        });
        if (!target) throw new NotFoundException('Manager was not found');
        const permissions = getPermissions(
            target.roleAssignments.map((assignment) => assignment.role),
        );
        if (!target.isActive || !permissions.includes('orders.review')) {
            throw new ConflictException('Manager is not eligible');
        }
        return target;
    }

    private async updateOrder(
        manager: EntityManager,
        order: OrderEntity,
        changes: Partial<
            Pick<
                OrderEntity,
                'status' | 'assignedManagerId' | 'assignedAt' | 'confirmedAt'
            >
        >,
    ) {
        const nextVersion = order.version + 1;
        const result = await manager
            .getRepository(OrderEntity)
            .update(
                { id: order.id, version: order.version },
                { ...changes, version: nextVersion },
            );
        if (result.affected !== 1) {
            throw new ConflictException('Order version is stale');
        }
        Object.assign(order, changes, { version: nextVersion });
    }

    private async replaceQuoteLines(
        manager: EntityManager,
        quoteId: number,
        snapshots: readonly QuoteLineSnapshot[],
    ) {
        const lines = manager.getRepository(OrderQuoteLineEntity);
        await lines.delete({ quoteId });
        await lines.save(
            snapshots.map((line) =>
                lines.create({
                    quoteId,
                    productId: line.productId,
                    sourceOrderLineId: line.sourceOrderLineId,
                    position: line.position,
                    skuSnapshot: line.skuSnapshot,
                    slugSnapshot: line.slugSnapshot,
                    nameSnapshot: line.nameSnapshot,
                    brandSnapshot: line.brandSnapshot,
                    catalogUnitPriceMinor: line.catalogUnitPriceMinor,
                    quotedUnitPriceMinor: line.quotedUnitPriceMinor,
                    vatRateSnapshot: line.vatRateSnapshot,
                    quantity: line.quantity,
                    catalogLineTotalMinor: line.catalogLineTotalMinor,
                    quotedLineTotalMinor: line.quotedLineTotalMinor,
                }),
            ),
        );
    }

    private recordStaffEvent(
        manager: EntityManager,
        orderId: number,
        actorStaffId: number,
        input: {
            type: OrderEventEntity['type'];
            fromStatus: OrderEventEntity['fromStatus'];
            toStatus: OrderEventEntity['toStatus'];
            visibility: OrderEventEntity['visibility'];
            metadata: Record<string, unknown>;
        },
    ) {
        const events = manager.getRepository(OrderEventEntity);
        return events.save(
            events.create({
                orderId,
                ...input,
                actorType: 'staff',
                actorUserId: null,
                actorStaffId,
                message: null,
            }),
        );
    }

    private auditStaff(
        manager: EntityManager,
        actor: AdminPrincipal,
        action: string,
        order: OrderEntity,
        requestId: string | undefined,
        metadata: Record<string, unknown>,
    ) {
        return this.audit.record(
            {
                actorType: 'staff',
                actorStaffId: actor.id,
                actorSessionId: actor.sessionId,
                action,
                targetType: 'order',
                targetId: order.id,
                requestId:
                    requestId && isUUID(requestId) ? requestId : undefined,
                metadata: {
                    orderNumber: formatOrderNumber(order.id),
                    ...metadata,
                },
            },
            manager,
        );
    }

    private normalizeIdempotencyKey(value?: string) {
        const normalized = value?.trim().toLowerCase();
        if (!normalized || !isUUID(normalized)) {
            throw new BadRequestException(
                'Idempotency-Key header must contain a valid UUID',
            );
        }
        return normalized;
    }

    private async resolveOrganization(
        manager: EntityManager,
        userId: number,
        input: NormalizedOrderSubmission,
    ): Promise<OrderOrganizationSnapshot> {
        if (input.customerType === 'individual') {
            return {
                organizationId: null,
                name: null,
                inn: null,
                kpp: null,
                ogrn: null,
                legalAddress: null,
                actualAddress: null,
                taxSystem: null,
            };
        }
        if (input.organizationId !== null) {
            const membership = await manager
                .getRepository(OrganizationMemberEntity)
                .findOne({
                    where: {
                        userId,
                        organizationId: input.organizationId,
                        status: 'active',
                    },
                    relations: { organization: true },
                });
            if (!membership?.organization) {
                throw new NotFoundException('Organization was not found');
            }
            return this.snapshotOrganization(membership.organization);
        }
        if (!input.organization) {
            throw new BadRequestException('Organization details are required');
        }
        return {
            organizationId: null,
            ...input.organization,
        };
    }

    private snapshotOrganization(
        organization: OrganizationEntity,
    ): OrderOrganizationSnapshot {
        const snapshot = normalizeLinkedOrganizationSnapshot(
            organization,
            (inn) => this.organizations.normalizeInn(inn),
        );
        return {
            organizationId: organization.id,
            ...snapshot,
        };
    }

    private async loadEligibleProducts(manager: EntityManager, ids: number[]) {
        const products = await manager
            .getRepository(CatalogProductEntity)
            .createQueryBuilder('product')
            .innerJoinAndSelect('product.category', 'category')
            .where('product.id IN (:...ids)', { ids })
            .getMany();
        if (
            products.length !== ids.length ||
            products.some(
                (product) =>
                    !product.isActive ||
                    !product.isPublished ||
                    !product.category?.isPublished ||
                    product.availabilityStatus === 'unavailable',
            )
        ) {
            throw new ConflictException('One or more products are unavailable');
        }
        return products;
    }

    private async loadOrder(manager: EntityManager, id: number) {
        const order = await manager.getRepository(OrderEntity).findOne({
            where: { id },
            relations: {
                lines: true,
                events: true,
                assignedManager: true,
                quote: {
                    lines: true,
                    createdByStaff: true,
                    updatedByStaff: true,
                    confirmedByStaff: true,
                },
            },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return order;
    }

    private async lineCounts(ids: number[]) {
        if (!ids.length) return new Map<number, number>();
        const rows: Array<{ orderId: string; count: string }> =
            await this.dataSource
                .getRepository(OrderLineEntity)
                .createQueryBuilder('line')
                .select('line.orderId', 'orderId')
                .addSelect('COUNT(*)', 'count')
                .where('line.orderId IN (:...ids)', { ids })
                .groupBy('line.orderId')
                .getRawMany();
        return new Map(
            rows.map((row) => [Number(row.orderId), Number(row.count)]),
        );
    }

    private pagination(query: { page?: number; limit?: number }) {
        return {
            page: query.page ?? 1,
            limit: query.limit ?? ORDER_PAGE_SIZE_DEFAULT,
        };
    }

    private presentSummary(
        order: OrderEntity,
        itemCount: number,
        admin: boolean,
    ) {
        return {
            id: order.id,
            orderNumber: formatOrderNumber(order.id),
            status: order.status,
            version: order.version,
            customerType: order.customerType,
            ...(admin ? { createdByUserId: order.createdByUserId } : {}),
            organization:
                order.customerType === 'organization'
                    ? {
                          id: order.organizationId,
                          name: order.organizationNameSnapshot,
                          inn: order.organizationInnSnapshot,
                          kpp: order.organizationKppSnapshot,
                      }
                    : null,
            contact: {
                name: order.contactNameSnapshot,
                phone: order.contactPhoneSnapshot,
                email: order.contactEmailSnapshot,
            },
            itemCount,
            catalogPricedSubtotalMinor: order.catalogPricedSubtotalMinor,
            hasUnpricedItems: order.hasUnpricedItems,
            catalogTotalMinor: order.hasUnpricedItems
                ? null
                : order.catalogPricedSubtotalMinor,
            currency: order.currency,
            ...(admin
                ? {
                      assignedManager: this.presentManager(
                          order.assignedManager,
                      ),
                      assignedAt: order.assignedAt,
                      confirmedAt: order.confirmedAt,
                      quote: order.quote
                          ? this.presentQuoteSummary(order.quote)
                          : null,
                  }
                : {
                      confirmedQuote: this.presentClientConfirmedQuote(order),
                  }),
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
        };
    }

    private presentDetail(order: OrderEntity, admin: boolean) {
        const lines = [...(order.lines || [])].sort(
            (left, right) =>
                left.position - right.position || left.id - right.id,
        );
        const events = [...(order.events || [])]
            .filter((event) => admin || event.visibility === 'customer')
            .sort(
                (left, right) =>
                    left.createdAt.getTime() - right.createdAt.getTime() ||
                    left.id - right.id,
            );
        const quoteLines = [...(order.quote?.lines || [])].sort(
            (left, right) =>
                left.position - right.position || left.id - right.id,
        );
        return {
            ...this.presentSummary(order, lines.length, admin),
            organization:
                order.customerType === 'organization'
                    ? {
                          id: order.organizationId,
                          name: order.organizationNameSnapshot,
                          inn: order.organizationInnSnapshot,
                          kpp: order.organizationKppSnapshot,
                          ogrn: order.organizationOgrnSnapshot,
                          legalAddress: order.organizationLegalAddressSnapshot,
                          actualAddress:
                              order.organizationActualAddressSnapshot,
                          taxSystem: order.organizationTaxSystemSnapshot,
                      }
                    : null,
            delivery: {
                type: order.deliveryType,
                city: order.deliveryCitySnapshot,
                address: order.deliveryAddressSnapshot,
                comment: order.deliveryCommentSnapshot,
            },
            customerComment: order.customerComment,
            lines: lines.map((line) => ({
                productId: line.productId,
                position: line.position,
                skuSnapshot: line.skuSnapshot,
                slugSnapshot: line.slugSnapshot,
                nameSnapshot: line.nameSnapshot,
                brandSnapshot: line.brandSnapshot,
                catalogUnitPriceMinor: line.catalogUnitPriceMinor,
                vatRateSnapshot: line.vatRateSnapshot,
                quantity: line.quantity,
                catalogLineTotalMinor: line.catalogLineTotalMinor,
            })),
            events: events.map((event) => ({
                id: event.id,
                type: event.type,
                fromStatus: event.fromStatus,
                toStatus: event.toStatus,
                visibility: event.visibility,
                message: event.message,
                metadata: event.metadata,
                ...(admin ? { actorStaffId: event.actorStaffId } : {}),
                createdAt: event.createdAt,
            })),
            ...(admin
                ? {
                      quote: order.quote
                          ? {
                                ...this.presentQuoteSummary(order.quote),
                                internalComment: order.quote.internalComment,
                                createdByStaff: this.presentManager(
                                    order.quote.createdByStaff,
                                ),
                                updatedByStaff: this.presentManager(
                                    order.quote.updatedByStaff,
                                ),
                                confirmedByStaff: this.presentManager(
                                    order.quote.confirmedByStaff,
                                ),
                                confirmedAt: order.quote.confirmedAt,
                                lines: quoteLines.map((line) =>
                                    this.presentQuoteLine(line, true),
                                ),
                            }
                          : null,
                  }
                : {
                      confirmedQuote: this.presentClientConfirmedQuote(
                          order,
                          quoteLines,
                      ),
                  }),
        };
    }

    private presentManager(manager?: AdminUserEntity | null) {
        return manager
            ? {
                  id: manager.id,
                  displayName: manager.displayName,
                  isActive: manager.isActive,
              }
            : null;
    }

    private presentQuoteSummary(quote: OrderQuoteEntity) {
        return {
            status: quote.status,
            revision: quote.revision,
            hasUnpricedItems: quote.hasUnpricedItems,
            catalogPricedSubtotalMinor: quote.catalogPricedSubtotalMinor,
            quotedPricedSubtotalMinor: quote.quotedPricedSubtotalMinor,
            quotedTotalMinor: quote.hasUnpricedItems
                ? null
                : quote.quotedPricedSubtotalMinor,
            currency: quote.currency,
        };
    }

    private presentQuoteLine(line: OrderQuoteLineEntity, admin: boolean) {
        return {
            productId: line.productId,
            ...(admin ? { sourceOrderLineId: line.sourceOrderLineId } : {}),
            position: line.position,
            skuSnapshot: line.skuSnapshot,
            slugSnapshot: line.slugSnapshot,
            nameSnapshot: line.nameSnapshot,
            brandSnapshot: line.brandSnapshot,
            ...(admin
                ? {
                      catalogUnitPriceMinor: line.catalogUnitPriceMinor,
                      catalogLineTotalMinor: line.catalogLineTotalMinor,
                  }
                : {}),
            quotedUnitPriceMinor: line.quotedUnitPriceMinor,
            vatRateSnapshot: line.vatRateSnapshot,
            quantity: line.quantity,
            quotedLineTotalMinor: line.quotedLineTotalMinor,
        };
    }

    private isConfirmedQuoteVisible(order: OrderEntity) {
        return Boolean(
            order.quote?.status === 'confirmed' &&
                [
                    'confirmed',
                    'waiting_payment',
                    'paid',
                    'fulfilled',
                    'completed',
                ].includes(order.status),
        );
    }

    private presentClientConfirmedQuote(
        order: OrderEntity,
        lines?: OrderQuoteLineEntity[],
    ) {
        if (!this.isConfirmedQuoteVisible(order) || !order.quote) return null;
        return {
            revision: order.quote.revision,
            currency: order.quote.currency,
            quotedTotalMinor: order.quote.quotedPricedSubtotalMinor,
            ...(lines
                ? {
                      lines: lines.map((line) =>
                          this.presentQuoteLine(line, false),
                      ),
                  }
                : {}),
        };
    }

    private parseOrderNumber(value: string) {
        const match = /^VM-(\d+)$/i.exec(value);
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isInteger(id) && id > 0 && id <= POSTGRES_INTEGER_MAX
            ? id
            : null;
    }

    private escapeLike(value: string) {
        return value.replace(/[\\%_]/g, (character) => `\\${character}`);
    }
}

export function isOrderPersistenceConflict(error: unknown) {
    if (!(error instanceof QueryFailedError)) return false;
    const code = (error.driverError as { code?: string }).code;
    return ['22001', '22003', '23502', '23503', '23505', '23514'].includes(
        code || '',
    );
}
