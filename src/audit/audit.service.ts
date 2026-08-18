import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEventEntity, type AuditActorType, type AuditResult } from './entities/audit-event.entity';
import { sanitizeAuditMetadata } from './audit-sanitizer';

export interface AuditInput {
    actorType: AuditActorType;
    actorStaffId?: number;
    actorCustomerId?: number;
    actorSessionId?: number;
    action: string;
    targetType: string;
    targetId?: string | number;
    result?: AuditResult;
    reason?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
}

export interface AuditQuery {
    page?: number;
    limit?: number;
    actorStaffId?: number;
    action?: string;
    targetType?: string;
    targetId?: string;
    result?: AuditResult;
    from?: Date;
    to?: Date;
}

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditEventEntity)
        private readonly events: Repository<AuditEventEntity>,
    ) {}

    record(input: AuditInput, manager?: EntityManager) {
        const events = manager
            ? manager.getRepository(AuditEventEntity)
            : this.events;
        const event = events.create({
            actorType: input.actorType,
            actorStaffId: input.actorStaffId ?? null,
            actorCustomerId: input.actorCustomerId ?? null,
            actorSessionId: input.actorSessionId ?? null,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId === undefined ? null : String(input.targetId),
            result: input.result ?? 'success',
            reason: input.reason?.slice(0, 500) ?? null,
            requestId: input.requestId ?? null,
            metadata: input.metadata
                ? sanitizeAuditMetadata(input.metadata) as Record<string, unknown>
                : null,
        });
        return events.save(event);
    }

    async list(query: AuditQuery) {
        const page = Math.max(query.page ?? 1, 1);
        const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
        const builder = this.events.createQueryBuilder('event');
        if (query.actorStaffId) builder.andWhere('event.actorStaffId = :actorStaffId', { actorStaffId: query.actorStaffId });
        if (query.action) builder.andWhere('event.action = :action', { action: query.action });
        if (query.targetType) builder.andWhere('event.targetType = :targetType', { targetType: query.targetType });
        if (query.targetId) builder.andWhere('event.targetId = :targetId', { targetId: query.targetId });
        if (query.result) builder.andWhere('event.result = :result', { result: query.result });
        if (query.from) builder.andWhere('event.createdAt >= :from', { from: query.from });
        if (query.to) builder.andWhere('event.createdAt <= :to', { to: query.to });
        const [items, total] = await builder
            .orderBy('event.createdAt', 'DESC')
            .addOrderBy('event.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return { items, total, page, limit };
    }
}
