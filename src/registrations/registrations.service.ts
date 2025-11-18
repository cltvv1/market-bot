import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';

@Injectable()
export class RegistrationsService {
    constructor(
        @InjectRepository(RegistrationRequestEntity)
        private readonly registrationRepo: Repository<RegistrationRequestEntity>,
    ) { }

    async startRegistration(chatId: string) {
        let registration = await this.registrationRepo.findOne({ where: { chatId } });
        if (!registration) {
            registration = this.registrationRepo.create({ chatId, currentStep: 1 });
            await this.registrationRepo.save(registration);
        }
        return registration;
    }

    async updateStep(chatId: string, step: number, partialData: Partial<RegistrationRequestEntity>) {
        await this.registrationRepo.update({ chatId }, { currentStep: step, ...partialData });
        return this.registrationRepo.findOne({ where: { chatId } });
    }

    async getRegistration(chatId: string) {
        return this.registrationRepo.findOne({ where: { chatId } });
    }
}

@Injectable()
export class RegistrationFieldsService {
    constructor(
        @InjectRepository(RegistrationFieldEntity)
        private readonly fieldsRepo: Repository<RegistrationFieldEntity>,
    ) { }

    async getAllFieldsOrdered() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }
}