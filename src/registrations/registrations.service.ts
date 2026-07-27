import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { UsersService } from 'src/users/users.service';
import { formatRegistrationDone, formatRegistrationRequest } from 'src/common/utils';
import { RegistrationField } from './registration.types';
import { UserPlatform } from 'src/users/entities/user.entity';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
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
    ) { }

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } })
    }

    async getNotFilledReg(chatId: string, platform: UserPlatform = 'telegram') {
        let reg = await this.registrationRepo.findOne({ where: { chatId, platform, isFilled: false } });

        return reg;
    }

    async getRegistrationById(regId) {
        let reg = await this.registrationRepo.findOne({ where: { id: regId, isProcessed: false } });

        return reg;
    }

    async createRegistration(chatId: string, platform: UserPlatform = 'telegram', userId?: number, organizationId?: number) {
        const reg = this.registrationRepo.create({
            chatId,
            platform,
            userId,
            organizationId,
            currentStep: 2,
            isFilled: false,
        });
        await this.registrationRepo.save(reg);

        return reg
    }

    async getAllFields() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }

    async saveFieldValue(chatId: string, value: string, platform: UserPlatform = 'telegram') {
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

    async saveEquipmentPhoto(chatId: string, input: { buffer: Buffer; fileName?: string }, platform: UserPlatform = 'telegram') {
        const reg = await this.getNotFilledReg(chatId, platform);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (field !== 'equipmentPhoto') return reg;

        const mediaDir = path.join(process.cwd(), 'storage', 'registration-media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const safeName = `${randomUUID()}-${input.fileName || 'equipment-photo.jpg'}`;
        const filePath = path.join(mediaDir, safeName);
        fs.writeFileSync(filePath, input.buffer);

        reg.equipmentPhotoPath = filePath;
        reg.equipmentPhotoName = input.fileName || safeName;
        reg.currentStep++;
        await this.registrationRepo.save(reg);
        return reg;
    }

    async fillRegistration(chatId: string, values: Partial<Record<RegistrationField, string>>, platform: UserPlatform = 'telegram') {
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
        return nextField?.label
    }

    async getFieldNameByStep(step: number): Promise<RegistrationField | null> {
        const field = await this.fieldsRepo.findOne({ where: { step } });
        if (!field) return null;

        if (!this.isRegistrationField(field.name)) {
            throw new Error(`Invalid registration field from DB: ${field.name}`);
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
        const fields = await this.fieldsRepo.find();
        const pdfPath = await this.pdfService.generateRegistrationPdf(reg, fields);

        reg.pdfPath = pdfPath;
        reg.isFilled = true;
        await this.registrationRepo.save(reg);

        return pdfPath
    }

    async notifyAdminsAboutNewReg(reg: RegistrationRequestEntity, filePath: string) {
        const regAuthor = await this.usersService.getOrCreateOrUpdate(reg.chatId, undefined, undefined, reg.platform)
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

    async doReg(reg: RegistrationRequestEntity) {
        reg.isProcessed = true;
        await this.registrationRepo.save(reg);
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
}
