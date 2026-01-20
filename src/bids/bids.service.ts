import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BidEntity } from './entities/bid.entity';
import { BidFieldEntity } from './entities/bid-field.entity';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { UsersService } from 'src/users/users.service';
import { formatBid, formatRegistrationDone, formatRegistrationRequest } from 'src/common/utils';
import { TelegramSenderService } from 'src/telegramSender/telegram-sender.service';
import { bidDoneButton } from 'src/telegram/keyboards/keyboards';
import { BidField, isBidField } from './bid.types';

@Injectable()
export class BidService {
    constructor(
        @InjectRepository(BidEntity)
        private readonly bidsRepo: Repository<BidEntity>,

        @InjectRepository(BidFieldEntity)
        private readonly fieldsRepo: Repository<BidFieldEntity>,

        private usersService: UsersService,
        private telegramSenderService: TelegramSenderService
    ) { }

    async getAllBids() {
        return await this.bidsRepo.find({ order: { id: 'ASC' } })
    }

    async getNotFilledBid(chatId: string) {
        return await this.bidsRepo.findOne({ where: { chatId, isFilled: false } });
    }

    async getBidById(bidId) {
        return await this.bidsRepo.findOne({ where: { id: bidId, isProcessed: false } });
    }

    async createBid(chatId: string) {
        const bid = this.bidsRepo.create({
            chatId,
            currentStep: 2,
            isFilled: false,
        });
        await this.bidsRepo.save(bid);

        return bid
    }

    async getAllFields() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }

    async saveFieldValue(chatId: string, value: string) {
        const bid = await this.getNotFilledBid(chatId);
        if (!bid) return null;

        const field = await this.getFieldNameByStep(bid.currentStep);
        if (!field) return bid;

        bid[field] = value;
        bid.currentStep++;

        await this.bidsRepo.save(bid);
        return bid;
    }

    async isCompleted(bid: BidEntity) {
        const fields = await this.getAllFields();
        return bid.currentStep > fields.length;
    }

    async getFieldTextByStep(step: number) {
        const nextField = await this.fieldsRepo.findOne({ where: { step } });
        return nextField?.label
    }

    async getFieldNameByStep(step: number): Promise<BidField | null> {
        const field = await this.fieldsRepo.findOne({ where: { step } });
        if (!field) return null;

        if (!isBidField(field.name)) {
            throw new Error(`Invalid bid field from DB: ${field.name}`);
        }

        return field.name;
    }


    async getActualBids() {
        return this.bidsRepo.find({
            where: { isProcessed: false, isFilled: true },
            order: { createdAt: 'ASC' },
        });
    }

    async finishBid(bid: BidEntity) {
        bid.isFilled = true;
        await this.bidsRepo.save(bid);
        return bid
    }

    async notifyAdminsAboutNewReg(bid: BidEntity) {
        const admins = await this.usersService.getAdmins();
        if (!admins.length) return;

        const message = formatBid(bid);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.telegramSenderService.sendMessage(
                        admin.chatId,
                        message,
                        bidDoneButton(bid.id),
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

    async notifyAdminsAboutBidDone(bid: BidEntity) {
        const admins = await this.usersService.getAdmins();
        if (!admins.length) return;

        const message = formatRegistrationDone(bid);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.telegramSenderService.sendMessage(
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

    async doBid(bid: BidEntity) {
        bid.isProcessed = true;
        await this.bidsRepo.save(bid);
    }
}