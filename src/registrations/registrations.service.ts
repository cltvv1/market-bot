import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

@Injectable()
export class RegistrationsService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,
    ) { }

    async getAllRegs() {
        return this.registrationRepo.find({ order: { id: 'ASC' } })
    }
    async getOrCreateRegistration(chatId: string) {
        let reg = await this.registrationRepo.findOne({ where: { chatId } });

        if (!reg) {
            reg = this.registrationRepo.create({
                chatId,
                currentStep: 1,
                isFilled: false,
            });
            await this.registrationRepo.save(reg);
        }

        return reg;
    }

    async getAllFields() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }

    async saveFieldValue(chatId: string, value: string) {
        const reg = await this.getOrCreateRegistration(chatId);
        if (!reg) return null;

        const field = await this.getFieldNameByStep(reg.currentStep);
        if (!field) {
            // Значит шаг превышает количество полей → заявка заполнена
            reg.isFilled = true;
            await this.registrationRepo.save(reg);
            return null;
        }

        (reg as any)[field] = value;
        reg.currentStep++;

        const nextField = await this.getFieldNameByStep(reg.currentStep);
        if (!nextField) reg.isFilled = true;

        await this.registrationRepo.save(reg);

        return reg
    }

    async isCompleted(reg: RegistrationRequestEntity) {
        const fields = await this.getAllFields();
        return reg.currentStep > fields.length;
    }

    async getNextFieldText(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.label
    }

    async getFieldNameByStep(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.name
    }

}