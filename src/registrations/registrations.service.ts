import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { UsersService } from 'src/users/users.service';
import { formatRegistrationDone, formatRegistrationRequest } from 'src/common/utils';
import { RegistrationField } from './registration.types';
import { Inject } from '@nestjs/common';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { regDoneKeyboard } from 'src/messenger/messenger-keyboards';
@Injectable()
export class RegistrationsService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,

        private readonly pdfService: PdfGeneratorService,
        private usersService: UsersService,
        @Inject(MESSENGER_SERVICE)
        private messengerService: MessengerService
    ) { }

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } })
    }

    async getNotFilledReg(chatId: string) {
        let reg = await this.registrationRepo.findOne({ where: { chatId, isFilled: false } });

        return reg;
    }

    async getRegistrationById(regId) {
        let reg = await this.registrationRepo.findOne({ where: { id: regId, isProcessed: false } });

        return reg;
    }

    async createRegistration(chatId: string) {
        const reg = this.registrationRepo.create({
            chatId,
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

    async saveFieldValue(chatId: string, value: string) {
        const reg = await this.getNotFilledReg(chatId);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (!field) return reg;

        reg[field] = value;
        reg.currentStep++;

        await this.registrationRepo.save(reg);
        return reg;
    }

    async isCompleted(reg: RegistrationRequestEntity) {
        const fields = await this.getAllFields();
        return reg.currentStep > fields.length;
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
        reg.isFilled = true;
        await this.registrationRepo.save(reg);

        const fields = await this.fieldsRepo.find();
        const pdfPath = await this.pdfService.generateRegistrationPdf(reg, fields);

        reg.pdfPath = pdfPath;
        await this.registrationRepo.save(reg);

        return pdfPath
    }

    async notifyAdminsAboutNewReg(reg: RegistrationRequestEntity, filePath: string) {
        const admins = await this.usersService.getAdmins('telegram');
        const regAuthor = await this.usersService.getOrCreateOrUpdate(reg.chatId)
        if (!admins.length) return;

        const message = formatRegistrationRequest(reg, regAuthor);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.messengerService.sendMessage(
                        admin.chatId,
                        message,
                        { inlineKeyboard: regDoneKeyboard(reg.id) },
                    );

                    await this.messengerService.sendDocument(
                        admin.chatId,
                        {
                            source: fs.createReadStream(filePath),
                            filename: `${reg.orgName}.pdf`,
                        },
                    );
                } catch (e) {
                    console.error(
                        `Failed to notify admin ${admin.chatId}:`,
                        e,
                    );
                }
            })
        );
    }

    async notifyAdminsAboutRegDone(reg: RegistrationRequestEntity) {
        const admins = await this.usersService.getAdmins('telegram');
        if (!admins.length) return;

        const message = formatRegistrationDone(reg);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.messengerService.sendMessage(
                        admin.chatId,
                        message,
                    );
                } catch (e) {
                    console.error(
                        `Failed to notify admin ${admin.chatId}`,
                        e,
                    );
                }
            }),
        );
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
        ].includes(value);
    }
}
