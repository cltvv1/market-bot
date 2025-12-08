import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { PdfGeneratorService } from 'src/pdf/pdf.service';

@Injectable()
export class RegistrationsService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,

        private readonly pdfService: PdfGeneratorService
    ) { }

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } })
    }

    async getRegistration(chatId: string) {
        let reg = await this.registrationRepo.findOne({ where: { chatId, isFilled: false } });

        return reg;
    }

    async getRegistrationById(regId) {
        let reg = await this.registrationRepo.findOne({ where: { id: regId } });

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
        const reg = await this.getRegistration(chatId);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (!field) {
            reg.isFilled = true;
            await this.registrationRepo.save(reg);
            return null;
        }

        (reg as any)[field] = value;
        reg.currentStep++;

        await this.registrationRepo.save(reg);

        return reg
    }

    async isCompleted(reg: RegistrationRequestEntity) {
        const fields = await this.getAllFields();
        return reg.currentStep > fields.length;
    }

    async getFieldTextByStep(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.label
    }

    async getFieldNameByStep(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.name
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

        // Генерация PDF
        const fields = await this.fieldsRepo.find();
        const pdfPath = await this.pdfService.generateRegistrationPdf(reg, fields);

        reg.pdfPath = pdfPath;
        await this.registrationRepo.save(reg);

        return pdfPath
    }
}