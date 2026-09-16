import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from 'src/audit/audit.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestEntity } from './entities/service-request.entity';

// The hash remains request-local and is used only to recheck revocation under lock.
export interface PublicServiceRequestAccess {
    serviceRequestId: number;
    customerId: number;
    capabilityHash: string;
}
export function publicAccessDenied() {
    return new UnauthorizedException('Public access is unavailable');
}
export function publicAccessHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
}
export function validPublicAccessToken(token: string) {
    return (
        /^[A-Za-z0-9_-]{43}$/.test(token) &&
        Buffer.from(token, 'base64url').toString('base64url') === token
    );
}

@Injectable()
export class ServiceRequestPublicAccessService {
    constructor(
        private readonly db: DataSource,
        private readonly audit: AuditService,
    ) {}

    async state(session: WebSessionPrincipal, id: number) {
        const row = await this.owned(this.db.manager, session.userId, id);
        return { enabled: row.publicTokenHash !== null, version: row.version };
    }

    mutate(
        session: WebSessionPrincipal,
        id: number,
        expectedVersion: number,
        revoke: boolean,
    ) {
        return this.db.transaction(async (manager) => {
            const row = await this.owned(manager, session.userId, id, true);
            if (revoke && row.publicTokenHash === null)
                return { enabled: false, version: row.version };
            if (row.version !== expectedVersion)
                throw new ConflictException(
                    'Service request was updated in another session',
                );
            if (!revoke && row.status === 'draft')
                throw new BadRequestException(
                    'Submit the request before sharing',
                );
            const action = revoke
                ? 'revoke'
                : row.publicTokenHash
                  ? 'rotate'
                  : 'issue';
            const token = revoke
                ? undefined
                : randomBytes(32).toString('base64url');
            row.publicTokenHash = token ? publicAccessHash(token) : null;
            await manager.getRepository(ServiceRequestEntity).save(row);
            await this.audit.record(
                {
                    actorType: 'customer',
                    actorCustomerId: session.userId,
                    actorWebSessionId: session.sessionId,
                    action: `service_request.public_access.${action}`,
                    targetType: 'service_request',
                    targetId: row.id,
                },
                manager,
            );
            return {
                enabled: !revoke,
                version: row.version,
                ...(token ? { token } : {}),
            };
        });
    }

    async resolve(token: string): Promise<PublicServiceRequestAccess> {
        if (!validPublicAccessToken(token)) throw publicAccessDenied();
        const capabilityHash = publicAccessHash(token);
        const row = await this.db
            .getRepository(ServiceRequestEntity)
            .findOneBy({ publicTokenHash: capabilityHash });
        if (!row || !row.userId) throw publicAccessDenied();
        return {
            serviceRequestId: row.id,
            customerId: row.userId,
            capabilityHash,
        };
    }

    assert(
        row: ServiceRequestEntity | null,
        access: PublicServiceRequestAccess,
    ): asserts row is ServiceRequestEntity {
        if (
            !row ||
            row.id !== access.serviceRequestId ||
            row.userId !== access.customerId ||
            !row.publicTokenHash ||
            row.publicTokenHash !== access.capabilityHash
        )
            throw publicAccessDenied();
    }

    async current(access: PublicServiceRequestAccess) {
        const row = await this.db
            .getRepository(ServiceRequestEntity)
            .findOneBy({ id: access.serviceRequestId });
        this.assert(row, access);
        return row;
    }

    // Reads/download opening serialize with rotation; already-sent bytes cannot be recalled.
    read<T>(
        access: PublicServiceRequestAccess,
        use: (row: ServiceRequestEntity) => Promise<T>,
    ) {
        return this.db.transaction(async (manager) => {
            const row = await manager
                .getRepository(ServiceRequestEntity)
                .findOne({
                    where: { id: access.serviceRequestId },
                    lock: { mode: 'pessimistic_read' },
                });
            this.assert(row, access);
            return use(row);
        });
    }

    private async owned(
        manager: EntityManager,
        userId: number,
        id: number,
        lock = false,
    ) {
        const row = await manager.getRepository(ServiceRequestEntity).findOne({
            where: { id, userId },
            ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
        });
        if (!row) throw new NotFoundException('Service request was not found');
        return row;
    }
}
