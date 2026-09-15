import * as path from 'path';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RegistrationCommandContext } from './registration-admin-policy';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { UsersService } from 'src/users/users.service';
import {
    formatRegistrationDone,
    formatRegistrationRequest,
} from 'src/common/utils';
import { RegistrationField } from './registration.types';
import { FilesService } from 'src/files/files.service';
import { UserPlatform } from 'src/users/entities/user.entity';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import { RegistrationReadinessService } from './registration-readiness.service';
@Injectable()
export class RegistrationsService {
    private readonly logger = new Logger(RegistrationsService.name);
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,

        private readonly pdfService: PdfGeneratorService,
        private usersService: UsersService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly filesService: FilesService,
        private readonly readinessService: RegistrationReadinessService,
        private readonly dataSource: DataSource,
    ) {}

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } });
    }

    async getNotFilledReg(chatId: string, platform: UserPlatform = 'telegram') {
        const reg = await this.registrationRepo.findOne({
            where: { chatId, platform, status: 'draft' },
            order: { createdAt: 'DESC', id: 'DESC' },
        });

        return reg;
    }

    async getRegistrationById(regId: number) {
        const reg = await this.registrationRepo.findOne({
            where: { id: regId, status: Not('processed') },
        });

        return reg;
    }

    async createRegistration(
        chatId: string,
        platform: UserPlatform = 'telegram',
        userId?: number,
        organizationId?: number,
    ) {
        const registration = await this.dataSource.transaction(
            async (manager) => {
                await manager.query(
                    'SELECT pg_advisory_xact_lock(hashtext($1))',
                    [`registration-draft:${platform}:${chatId}`],
                );
                const registrations = manager.getRepository(
                    RegistrationRequestEntity,
                );
                const existing = await registrations.findOne({
                    where: { chatId, platform, status: 'draft' },
                    order: { createdAt: 'DESC', id: 'DESC' },
                });
                if (existing) return existing;

                const created = await registrations.save(
                    registrations.create({
                        chatId,
                        platform,
                        userId,
                        organizationId,
                        currentStep: 2,
                        status: 'draft',
                    }),
                );
                await this.readinessService.initialize(created.id, manager);
                return created;
            },
        );
        return registration;
    }

    async getAllFields() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }

    async saveFieldValue(
        chatId: string,
        value: string,
        platform: UserPlatform = 'telegram',
    ) {
        return this.dataSource.transaction(async (manager) => {
            const reg = await manager
                .getRepository(RegistrationRequestEntity)
                .findOne({
                    where: { chatId, platform, status: 'draft' },
                    order: { createdAt: 'DESC', id: 'DESC' },
                    lock: { mode: 'pessimistic_write' },
                });
            if (!reg) return null;

            const field = await this.getFieldNameByStep(reg.currentStep);
            if (!field || field === 'equipmentPhoto') return reg;

            reg[field] = value;
            reg.currentStep++;

            return manager.getRepository(RegistrationRequestEntity).save(reg);
        });
    }

    async saveEquipmentPhoto(
        chatId: string,
        input: { buffer: Buffer; fileName?: string },
        platform: UserPlatform = 'telegram',
    ) {
        const reg = await this.getNotFilledReg(chatId, platform);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (field !== 'equipmentPhoto') return reg;

        await this.readinessService.uploadEvidence(
            {
                chatId: reg.chatId,
                platform: reg.platform,
                userId: reg.userId ?? undefined,
            },
            reg.id,
            'kkt_serial',
            {
                buffer: input.buffer,
                fileName: input.fileName,
                mimeType: this.imageMime(input.fileName),
            },
        );
        reg.currentStep++;
        await this.registrationRepo.save(reg);
        return reg;
    }

    async skipEquipmentPhoto(
        chatId: string,
        platform: UserPlatform = 'telegram',
    ) {
        return this.dataSource.transaction(async (manager) => {
            const reg = await manager
                .getRepository(RegistrationRequestEntity)
                .findOne({
                    where: { chatId, platform, status: 'draft' },
                    order: { createdAt: 'DESC', id: 'DESC' },
                    lock: { mode: 'pessimistic_write' },
                });
            if (!reg) return null;
            if (
                (await this.getFieldNameByStep(reg.currentStep)) !==
                'equipmentPhoto'
            ) {
                return reg;
            }
            reg.currentStep++;
            return manager.getRepository(RegistrationRequestEntity).save(reg);
        });
    }

    async fillRegistration(
        chatId: string,
        values: Partial<Record<RegistrationField, string>>,
        platform: UserPlatform = 'telegram',
    ) {
        const reg = await this.getNotFilledReg(chatId, platform);
        if (!reg) return null;

        for (const [field, value] of Object.entries(values)) {
            if (!this.isRegistrationField(field)) continue;
            if (field === 'equipmentPhoto') continue;
            const trimmed = value?.trim();
            if (trimmed) {
                reg[field] = trimmed;
            }
        }

        const fields = await this.getAllFields();
        reg.currentStep = Math.max(...fields.map((field) => field.step), 1) + 1;

        await this.registrationRepo.save(reg);
        return reg;
    }

    async isCompleted(reg: RegistrationRequestEntity) {
        const fields = await this.getAllFields();
        const lastStep = Math.max(...fields.map((field) => field.step), 1);
        return reg.currentStep > lastStep;
    }

    async getFieldTextByStep(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.label;
    }

    async getFieldNameByStep(step: number): Promise<RegistrationField | null> {
        const field = await this.fieldsRepo.findOne({ where: { step } });
        if (!field) return null;

        if (!this.isRegistrationField(field.name)) {
            throw new Error(
                `Invalid registration field from DB: ${field.name}`,
            );
        }

        return field.name;
    }

    async getActualRegs() {
        return this.registrationRepo.find({
            where: { status: In(['new', 'in_work']) },
            order: { createdAt: 'ASC' },
        });
    }

    async finishReg(reg: RegistrationRequestEntity) {
        await this.readinessService.initialize(reg.id);
        const readiness = await this.readinessService.details(reg.id);
        const fields = await this.fieldsRepo.find();
        const pdf = await this.pdfService.generateRegistrationPdf(reg, fields, {
            draft: true,
            requirements: readiness.requirements,
        });
        const storedPdf = await this.filesService.saveBuffer({
            purpose: 'generated-pdf',
            buffer: pdf,
            originalName: `registration_${reg.id}.pdf`,
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: {
                registrationId: reg.id,
                draft: true,
                final: false,
            },
        });
        const regAuthor = await this.usersService.getOrCreateOrUpdate(
            reg.chatId,
            undefined,
            undefined,
            reg.platform,
        );
        const message = formatRegistrationRequest(reg, regAuthor);
        try {
            const saved = await this.dataSource.transaction(async (manager) => {
                const registrations = manager.getRepository(
                    RegistrationRequestEntity,
                );
                const locked = await registrations.findOne({
                    where: { id: reg.id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked) throw new Error('Registration was not found');
                locked.pdfFileId = storedPdf.id;
                locked.status = 'new';
                const updated = await registrations.save(locked);
                const context = {
                    dedupeKey: `registration:${updated.id}:submitted`,
                    sourceType: 'registration',
                    sourceId: updated.id,
                    manager,
                };
                await this.adminNotificationsService.notify(
                    'registrations',
                    message,
                    context,
                );
                await this.adminNotificationsService.notifyDocument(
                    'registrations',
                    {
                        storedFileId: storedPdf.id,
                        filename: `${updated.orgName}.pdf`,
                    },
                    context,
                );
                return updated;
            });
            Object.assign(reg, saved);
        } catch (error) {
            await this.filesService.logicalDelete(storedPdf.id);
            throw error;
        }

        return pdf;
    }

    async getReadinessDetails(id: number) {
        return this.readinessService.details(id);
    }

    async generateFinalPdf(id: number, context?: RegistrationCommandContext) {
        const details = await this.dataSource.transaction((manager) =>
            this.readinessService.finalPdfSnapshot(manager, id, context),
        );
        const snapshot = (data: typeof details) => {
            const registration = Object.fromEntries(
                Object.entries(data.registration).filter(
                    ([key]) =>
                        ![
                            'pdfFileId',
                            'pdfFile',
                            'updatedAt',
                            'readinessUpdatedAt',
                        ].includes(key),
                ),
            );
            return createHash('sha256')
                .update(
                    JSON.stringify({
                        registration,
                        requirements: data.requirements.map((item) => ({
                            id: item.id,
                            kind: item.kind,
                            version: item.version,
                        })),
                    }),
                )
                .digest('hex');
        };
        const snapshotHash = snapshot(details);
        if (details.registration.pdfFileId) {
            const existing = await this.filesService.get(
                details.registration.pdfFileId,
            );
            if (
                existing?.status === 'active' &&
                existing.metadata?.final === true &&
                existing.metadata?.registrationSnapshot === snapshotHash
            )
                return existing;
        }
        const fields = await this.fieldsRepo.find();
        const pdf = await this.pdfService.generateRegistrationPdf(
            details.registration,
            fields,
            { draft: false, requirements: details.requirements },
        );
        const stored = await this.filesService.saveBuffer({
            purpose: 'generated-pdf',
            buffer: pdf,
            originalName: `registration_${id}_final.pdf`,
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: {
                registrationId: id,
                final: true,
                registrationSnapshot: snapshotHash,
            },
        });
        try {
            await this.dataSource.transaction(async (manager) => {
                const current = await this.readinessService.finalPdfSnapshot(
                    manager,
                    id,
                    context,
                );
                if (
                    snapshot(current) !== snapshotHash ||
                    current.registration.pdfFileId !==
                        details.registration.pdfFileId
                )
                    throw new ConflictException(
                        'Registration changed during PDF generation',
                    );
                await manager.update(RegistrationRequestEntity, id, {
                    pdfFileId: stored.id,
                });
                await this.readinessService.recordFinalPdf(
                    manager,
                    id,
                    context?.staffId,
                );
            });
            return stored;
        } catch (error) {
            await this.filesService
                .logicalDelete(stored.id)
                .catch(() =>
                    this.logger.warn(
                        'Failed to retire an unattached registration PDF',
                    ),
                );
            throw error;
        }
    }

    async doReg(reg: RegistrationRequestEntity, staffId: number) {
        return this.readinessService.handoffWithAction(
            reg.id,
            staffId,
            async (registration, manager) => {
                await this.adminNotificationsService.notify(
                    'registrations',
                    formatRegistrationDone(registration),
                    {
                        dedupeKey: `registration:${registration.id}:completed`,
                        sourceType: 'registration',
                        sourceId: registration.id,
                        manager,
                    },
                );
            },
        );
    }

    private isRegistrationField(value: string): value is RegistrationField {
        return [
            'orgName',
            'ogrn',
            'innKpp',
            'urAdress',
            'kktAdress',
            'kktName',
            'phone',
            'phoneToCall',
            'email',
            'nds',
            'excise',
            'markirovka',
            'services',
            'strictReporting',
            'taxSystem',
            'kktModel',
            'bankReqs',
            'ofd',
            'equipmentPhoto',
        ].includes(value);
    }

    private imageMime(fileName?: string) {
        const extension = path.extname(fileName || '').toLowerCase();
        if (extension === '.png') return 'image/png';
        if (extension === '.webp') return 'image/webp';
        return 'image/jpeg';
    }
}
