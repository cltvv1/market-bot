import { randomBytes, createHash } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { getPermissions } from './admin.permissions';
import type { AdminPrincipal } from './admin-auth.types';
import { AdminSessionEntity } from './entities/admin-session.entity';
import {
    AdminUserRoleEntity,
    AdminRole,
} from './entities/admin-user-role.entity';
import { AdminUserEntity } from './entities/admin-user.entity';
import {
    assertStrongPassword,
    createPasswordHash,
    verifyPasswordHash,
} from './password';

@Injectable()
export class AdminAuthService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AdminAuthService.name);

    constructor(
        @InjectRepository(AdminUserEntity)
        private readonly users: Repository<AdminUserEntity>,
        @InjectRepository(AdminUserRoleEntity)
        private readonly roles: Repository<AdminUserRoleEntity>,
        @InjectRepository(AdminSessionEntity)
        private readonly sessions: Repository<AdminSessionEntity>,
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
    ) {}

    async onApplicationBootstrap() {
        const count = await this.activeSuperadminCount();
        if (count === 0) {
            this.logger.warn(
                'No active superadmin exists. Run "npm run admin:create" to create the first staff account.',
            );
        }
    }

    getSessionCookieName() {
        return (
            this.config.get<string>('ADMIN_SESSION_COOKIE_NAME') ||
            'vitma_admin_session'
        );
    }

    getSessionTtlMs() {
        const hours = this.config.get<number>('ADMIN_SESSION_TTL_HOURS') ?? 12;
        return hours * 60 * 60 * 1000;
    }

    async login(login: string, password: string) {
        const user = await this.users.findOne({
            where: { login: login.trim().toLowerCase(), isActive: true },
            relations: { roleAssignments: true },
        });
        const valid = await verifyPasswordHash(password, user?.passwordHash);
        if (!user || !valid) return null;

        const token = randomBytes(32).toString('base64url');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.getSessionTtlMs());
        const session = await this.sessions.save(
            this.sessions.create({
                tokenHash: this.hashToken(token),
                userId: user.id,
                expiresAt,
                lastUsedAt: now,
                revokedAt: null,
            }),
        );
        user.lastLoginAt = now;
        await this.users.save(user);

        return {
            token,
            expiresAt,
            admin: this.presentPrincipal(user, session.id),
        };
    }

    async getPrincipalBySessionToken(token?: string | null) {
        if (!token) return null;
        const session = await this.sessions.findOne({
            where: {
                tokenHash: this.hashToken(token),
                expiresAt: MoreThan(new Date()),
                revokedAt: IsNull(),
            },
            relations: {
                user: {
                    roleAssignments: true,
                },
            },
        });
        if (!session?.user?.isActive) return null;

        const now = new Date();
        if (
            !session.lastUsedAt ||
            now.getTime() - session.lastUsedAt.getTime() > 5 * 60 * 1000
        ) {
            session.lastUsedAt = now;
            await this.sessions.save(session);
        }
        return this.presentPrincipal(session.user, session.id);
    }

    async logout(token?: string | null) {
        if (!token) return;
        await this.sessions.update(
            { tokenHash: this.hashToken(token), revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }

    async listStaff() {
        const users = await this.users.find({
            relations: { roleAssignments: true },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
        return users.map((user) => this.presentStaff(user));
    }

    async listActiveEngineers() {
        const users = await this.users
            .createQueryBuilder('user')
            .innerJoinAndSelect('user.roleAssignments', 'assignment')
            .where('user.isActive = true')
            .andWhere('assignment.role = :role', { role: 'engineer' })
            .orderBy('user.displayName', 'ASC')
            .getMany();
        return users.map((user) => this.presentStaff(user));
    }

    async createStaff(input: {
        login: string;
        displayName: string;
        password: string;
        roles: AdminRole[];
    }) {
        assertStrongPassword(input.password, input.login);
        const normalizedRoles = this.normalizeRoles(input.roles);
        const login = input.login.trim().toLowerCase();
        if (await this.users.exists({ where: { login } })) {
            throw new ConflictException('Staff login already exists');
        }

        const passwordHash = await createPasswordHash(input.password);
        return this.dataSource.transaction(async (manager) => {
            const userRepo = manager.getRepository(AdminUserEntity);
            const roleRepo = manager.getRepository(AdminUserRoleEntity);
            const user = await userRepo.save(
                userRepo.create({
                    login,
                    displayName: input.displayName.trim(),
                    passwordHash,
                    isActive: true,
                }),
            );
            user.roleAssignments = await roleRepo.save(
                normalizedRoles.map((role) =>
                    roleRepo.create({ userId: user.id, role }),
                ),
            );
            return this.presentStaff(user);
        });
    }

    async setRoles(userId: number, inputRoles: AdminRole[]) {
        const roles = this.normalizeRoles(inputRoles);
        const user = await this.requireUser(userId);
        const hadSuperadmin = user.roleAssignments.some(
            (assignment) => assignment.role === 'superadmin',
        );
        if (
            user.isActive &&
            hadSuperadmin &&
            !roles.includes('superadmin') &&
            (await this.activeSuperadminCount()) <= 1
        ) {
            throw new BadRequestException(
                'The last active superadmin cannot lose the superadmin role',
            );
        }

        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(AdminUserRoleEntity).delete({ userId });
            await manager
                .getRepository(AdminUserRoleEntity)
                .save(
                    roles.map((role) =>
                        manager
                            .getRepository(AdminUserRoleEntity)
                            .create({ userId, role }),
                    ),
                );
        });
        return this.getStaff(userId);
    }

    async setActive(userId: number, isActive: boolean) {
        const user = await this.requireUser(userId);
        if (
            !isActive &&
            user.isActive &&
            user.roleAssignments.some(
                (assignment) => assignment.role === 'superadmin',
            ) &&
            (await this.activeSuperadminCount()) <= 1
        ) {
            throw new BadRequestException(
                'The last active superadmin cannot be disabled',
            );
        }

        user.isActive = isActive;
        await this.users.save(user);
        if (!isActive) await this.revokeAllSessions(user.id);
        return this.getStaff(user.id);
    }

    async resetPassword(userId: number, password: string) {
        const user = await this.requireUser(userId);
        assertStrongPassword(password, user.login);
        user.passwordHash = await createPasswordHash(password);
        await this.users.save(user);
        await this.revokeAllSessions(user.id);
        return { ok: true };
    }

    async revokeAllSessions(userId: number) {
        await this.requireUser(userId);
        await this.sessions.update(
            { userId, revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
        return { ok: true };
    }

    async getStaff(userId: number) {
        return this.presentStaff(await this.requireUser(userId));
    }

    private async requireUser(userId: number) {
        const user = await this.users.findOne({
            where: { id: userId },
            relations: { roleAssignments: true },
        });
        if (!user) throw new NotFoundException('Staff account was not found');
        return user;
    }

    private activeSuperadminCount() {
        return this.users
            .createQueryBuilder('user')
            .innerJoin('user.roleAssignments', 'assignment')
            .where('user.isActive = true')
            .andWhere('assignment.role = :role', { role: 'superadmin' })
            .getCount();
    }

    private normalizeRoles(roles: AdminRole[]) {
        const unique = [...new Set(roles)];
        if (!unique.length) {
            throw new BadRequestException('At least one role is required');
        }
        return unique;
    }

    private presentPrincipal(
        user: AdminUserEntity,
        sessionId: number,
    ): AdminPrincipal {
        const roles = (user.roleAssignments || []).map(
            (assignment) => assignment.role,
        );
        return {
            id: user.id,
            login: user.login,
            displayName: user.displayName,
            roles,
            permissions: getPermissions(roles),
            isActive: user.isActive,
            sessionId,
        };
    }

    private presentStaff(user: AdminUserEntity) {
        return {
            id: user.id,
            login: user.login,
            displayName: user.displayName,
            roles: (user.roleAssignments || []).map(
                (assignment) => assignment.role,
            ),
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLoginAt: user.lastLoginAt,
        };
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('base64url');
    }
}
