import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { CustomerWebSessionEntity } from './entities/customer-web-session.entity';
import type { WebSessionPrincipal } from './web-session.types';

@Injectable()
export class WebSessionService {
    constructor(
        @InjectRepository(CustomerWebSessionEntity)
        private readonly sessions: Repository<CustomerWebSessionEntity>,
        private readonly usersService: UsersService,
        private readonly config: ConfigService,
    ) {}

    getCookieName() {
        return (
            this.config.get<string>('WEB_SESSION_COOKIE_NAME') ||
            'vitma_web_session'
        );
    }

    getTtlMs() {
        const days = this.config.get<number>('WEB_SESSION_TTL_DAYS') ?? 30;
        return days * 24 * 60 * 60 * 1000;
    }

    async create() {
        const chatId = `web-${randomUUID()}`;
        const user = await this.usersService.getOrCreateOrUpdate(
            chatId,
            undefined,
            undefined,
            'web',
        );
        const token = randomBytes(32).toString('base64url');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.getTtlMs());
        const session = await this.sessions.save(
            this.sessions.create({
                tokenHash: this.hashToken(token),
                userId: user.id,
                expiresAt,
                lastUsedAt: now,
                revokedAt: null,
            }),
        );
        return {
            token,
            principal: this.present(session, chatId),
        };
    }

    async resolve(token?: string | null) {
        if (!token) return null;
        const session = await this.sessions.findOne({
            where: {
                tokenHash: this.hashToken(token),
                expiresAt: MoreThan(new Date()),
                revokedAt: IsNull(),
            },
            relations: { user: true },
        });
        if (!session?.user || session.user.platform !== 'web') return null;

        const now = new Date();
        if (
            !session.lastUsedAt ||
            now.getTime() - session.lastUsedAt.getTime() > 5 * 60 * 1000
        ) {
            session.lastUsedAt = now;
            await this.sessions.save(session);
        }
        return this.present(session, session.user.chatId);
    }

    async revoke(token?: string | null) {
        if (!token) return;
        await this.sessions.update(
            { tokenHash: this.hashToken(token), revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }

    presentPublic(principal: WebSessionPrincipal) {
        return {
            status: 'active',
            expiresAt: principal.expiresAt,
        };
    }

    private present(
        session: CustomerWebSessionEntity,
        chatId: string,
    ): WebSessionPrincipal {
        return {
            sessionId: session.id,
            userId: session.userId,
            chatId,
            platform: 'web',
            expiresAt: session.expiresAt,
        };
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('base64url');
    }
}
