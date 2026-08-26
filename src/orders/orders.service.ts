import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuditService } from 'src/audit/audit.service';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { OrganizationEntity } from 'src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from 'src/organizations/entities/organization-member.entity';
import { OrganizationsService } from 'src/organizations/organizations.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { Brackets, DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type {
    AdminOrderListQueryDto,
    ClientOrderListQueryDto,
    SubmitOrderDto,
} from './dto/order.dto';
import { OrderEventEntity } from './entities/order-event.entity';
import { OrderLineEntity } from './entities/order-line.entity';
import { OrderEntity } from './entities/order.entity';
import {
    calculateCatalogTotals,
    formatOrderNumber,
    multiplyMinorUnits,
    normalizeOrderSubmission,
    orderAdvisoryLockKey,
    orderSubmissionFingerprint,
    type NormalizedOrderSubmission,
} from './order-intake';
import { ORDER_PAGE_SIZE_DEFAULT } from './order.types';

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
            if (this.isIntegrityConflict(error)) {
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
            relations: { lines: true, events: true },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return this.presentDetail(order, false);
    }

    async listAdmin(query: AdminOrderListQueryDto) {
        const { page, limit } = this.pagination(query);
        const builder = this.dataSource
            .getRepository(OrderEntity)
            .createQueryBuilder('order');
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
            relations: { lines: true, events: true },
        });
        if (!order) throw new NotFoundException('Order was not found');
        return this.presentDetail(order, true);
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
            if (!membership.organization.name?.trim()) {
                throw new ConflictException(
                    'Linked organization has incomplete details',
                );
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
        return {
            organizationId: organization.id,
            name: organization.name?.trim() || null,
            inn: organization.inn,
            kpp: organization.kpp,
            ogrn: organization.ogrn,
            legalAddress: organization.legalAddress,
            actualAddress: organization.actualAddress,
            taxSystem: organization.taxSystem,
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
            relations: { lines: true, events: true },
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
                createdAt: event.createdAt,
            })),
        };
    }

    private parseOrderNumber(value: string) {
        const match = /^VM-(\d+)$/i.exec(value);
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    private escapeLike(value: string) {
        return value.replace(/[\\%_]/g, (character) => `\\${character}`);
    }

    private isIntegrityConflict(error: unknown) {
        if (!(error instanceof QueryFailedError)) return false;
        const code = (error.driverError as { code?: string }).code;
        return ['23502', '23503', '23505', '23514'].includes(code || '');
    }
}
