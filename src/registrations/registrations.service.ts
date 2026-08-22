import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,

        private readonly pdfService: PdfGeneratorService,
        private usersService: UsersService,
        private readonly adminNotificationsService: AdminNotificationsService,
        private readonly filesService?: FilesService,
        @Optional()
        private readonly readinessService?: RegistrationReadinessService,
    ) {}

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } });
    }

    async getNotFilledReg(chatId: string, platform: UserPlatform = 'telegram') {
        let reg = await this.registrationRepo.findOne({
            where: { chatId, platform, isFilled: false },
        });

        return reg;
    }

    async getRegistrationById(regId) {
        let reg = await this.registrationRepo.findOne({
            where: { id: regId, isProcessed: false },
        });

        return reg;
    }

    async createRegistration(
        chatId: string,
        platform: UserPlatform = 'telegram',
        userId?: number,
        organizationId?: number,
    ) {
        const reg = this.registrationRepo.create({
            chatId,
            platform,
            userId,
            organizationId,
            currentStep: 2,
            isFilled: false,
        });
        await this.registrationRepo.save(reg);
        await this.readinessService?.initialize(reg.id);

        return reg;
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
        const reg = await this.getNotFilledReg(chatId, platform);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (!field) return reg;
        if (field === 'equipmentPhoto') return reg;

        reg[field] = value;
        reg.currentStep++;

        await this.registrationRepo.save(reg);
        return reg;
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

        if (!this.filesService) {
            throw new Error('File storage is unavailable');
        }
        const evidence = this.readinessService
            ? await this.readinessService.uploadEvidence(
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
              )
            : {
                  storedFileId: (
                      await this.filesService.saveBuffer({
                          purpose: 'registration-photo',
                          buffer: input.buffer,
                          originalName: input.fileName,
                          mimeType: this.imageMime(input.fileName),
                          createdByCustomerId: reg.userId ?? undefined,
                          metadata: { registrationId: reg.id },
                      })
                  ).id,
              };

        reg.equipmentPhotoPath = null;
        reg.equipmentPhotoName = input.fileName || 'equipment-photo';
        reg.equipmentPhotoFileId = evidence.storedFileId;
        reg.currentStep++;
        await this.registrationRepo.save(reg);
        return reg;
    }

    async skipEquipmentPhoto(
        chatId: string,
        platform: UserPlatform = 'telegram',
    ) {
        const reg = await this.getNotFilledReg(chatId, platform);
        if (!reg) return null;
        if (
            (await this.getFieldNameByStep(reg.currentStep)) !==
            'equipmentPhoto'
        )
            return reg;
        reg.currentStep++;
        return this.registrationRepo.save(reg);
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
            where: { isProcessed: false, isFilled: true },
            order: { createdAt: 'ASC' },
        });
    }

    async finishReg(reg: RegistrationRequestEntity) {
        await this.readinessService?.initialize(reg.id);
        const readiness = this.readinessService
            ? await this.readinessService.details(reg.id)
            : null;
        const fields = await this.fieldsRepo.find();
        const pdfPath = await this.pdfService.generateRegistrationPdf(
            reg,
            fields,
            {
                draft: true,
                requirements: readiness?.requirements,
            },
        );
        const storedPdf =
            this.filesService && fs.existsSync(pdfPath)
                ? await this.filesService.saveBuffer({
                      purpose: 'generated-pdf',
                      buffer: await fs.promises.readFile(pdfPath),
                      originalName: `registration_${reg.id}.pdf`,
                      mimeType: 'application/pdf',
                      serverGenerated: true,
                      metadata: {
                          registrationId: reg.id,
                          draft: true,
                          final: false,
                      },
                  })
                : null;

        reg.pdfPath = pdfPath;
        reg.pdfFileId = storedPdf?.id ?? null;
        reg.isFilled = true;
        await this.registrationRepo.save(reg);

        return pdfPath;
    }

    async getReadinessDetails(id: number) {
        if (!this.readinessService)
            throw new Error('Registration readiness is unavailable');
        return this.readinessService.details(id);
    }

    async generateFinalPdf(id: number) {
        if (!this.readinessService)
            throw new Error('Registration readiness is unavailable');
        const details = await this.readinessService.details(id);
        if (details.registration.readiness !== 'ready') {
            throw new Error('Registration is not ready for final PDF');
        }
        if (this.filesService && details.registration.pdfFileId) {
            const existing = await this.filesService.get(
                details.registration.pdfFileId,
            );
            if (
                existing?.metadata?.final === true &&
                details.registration.pdfPath &&
                fs.existsSync(details.registration.pdfPath)
            ) {
                return details.registration.pdfPath;
            }
        }
        const fields = await this.fieldsRepo.find();
        const pdfPath = await this.pdfService.generateRegistrationPdf(
            details.registration,
            fields,
            { draft: false, requirements: details.requirements },
        );
        if (!this.filesService || !fs.existsSync(pdfPath)) return pdfPath;
        const stored = await this.filesService.saveBuffer({
            purpose: 'generated-pdf',
            buffer: await fs.promises.readFile(pdfPath),
            originalName: `registration_${id}_final.pdf`,
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: { registrationId: id, final: true },
        });
        details.registration.pdfPath = pdfPath;
        details.registration.pdfFileId = stored.id;
        await this.registrationRepo.save(details.registration);
        return pdfPath;
    }

    async notifyAdminsAboutNewReg(
        reg: RegistrationRequestEntity,
        filePath: string,
    ) {
        const regAuthor = await this.usersService.getOrCreateOrUpdate(
            reg.chatId,
            undefined,
            undefined,
            reg.platform,
        );
        const message = formatRegistrationRequest(reg, regAuthor);

        await this.adminNotificationsService.notify('registrations', message);
        await this.adminNotificationsService.notifyDocument('registrations', {
            sourceFactory: () => fs.createReadStream(filePath),
            filename: `${reg.orgName}.pdf`,
        });
    }

    async notifyAdminsAboutRegDone(reg: RegistrationRequestEntity) {
        const message = formatRegistrationDone(reg);
        await this.adminNotificationsService.notify('registrations', message);
    }

    async doReg(reg: RegistrationRequestEntity, staffId?: number) {
        if (this.readinessService && staffId) {
            return this.readinessService.handoff(reg.id, staffId);
        }
        reg.isProcessed = true;
        await this.registrationRepo.save(reg);
        return reg;
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
