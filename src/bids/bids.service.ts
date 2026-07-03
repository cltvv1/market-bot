import { Repository } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { BidEntity } from './entities/bid.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BidField, BidType, isBidField } from './bid.types';
import { UsersService } from 'src/users/users.service';
import { formatBid, formatBidDone } from 'src/common/utils';
import { BidFieldEntity } from './entities/bid-field.entity';
import { MESSENGER_SERVICE } from 'src/messenger/messenger.types';
import type { MessengerService } from 'src/messenger/messenger.types';
import { bidDoneKeyboard } from 'src/messenger/messenger-keyboards';
import { UserPlatform } from 'src/users/entities/user.entity';

@Injectable()
export class BidService {
    constructor(
        @InjectRepository(BidEntity)
        private readonly bidsRepo: Repository<BidEntity>,

        @InjectRepository(BidFieldEntity)
        private readonly fieldsRepo: Repository<BidFieldEntity>,

        private usersService: UsersService,
        @Inject(MESSENGER_SERVICE)
        private messengerService: MessengerService
    ) { }

    async getAllBids() {
        return await this.bidsRepo.find({ order: { id: 'ASC' } })
    }

    async getNotFilledBid(chatId: string, platform: UserPlatform = 'telegram') {
        return await this.bidsRepo.findOne({ where: { chatId, platform, isFilled: false } });
    }

    async getBidById(bidId) {
        return await this.bidsRepo.findOne({ where: { id: bidId, isProcessed: false } });
    }

    async createBid(chatId: string, type: BidType, platform: UserPlatform = 'telegram') {
        const bid = this.bidsRepo.create({
            chatId,
            platform,
            currentStep: 1,
            isFilled: false,
            type
        });
        await this.bidsRepo.save(bid);

        return bid
    }

    async getAllFields() {
        return this.fieldsRepo.find({
            order: { step: 'ASC' },
        });
    }

    async saveFieldValue(chatId: string, value: string, platform: UserPlatform = 'telegram') {
        const bid = await this.getNotFilledBid(chatId, platform);
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

    async notifyAdminsAboutNewBid(bid: BidEntity) {
        const admins = await this.usersService.getAdmins(bid.platform);
        const bidAuthor = await this.usersService.getOrCreateOrUpdate(bid.chatId, undefined, undefined, bid.platform)
        if (!admins.length) return;

        const message = formatBid(bid, bidAuthor);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.messengerService.sendMessage(
                        admin.chatId,
                        message,
                        { inlineKeyboard: bidDoneKeyboard(bid.id), platform: admin.platform },
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
        const admins = await this.usersService.getAdmins(bid.platform);
        if (!admins.length) return;

        const message = formatBidDone(bid);

        await Promise.all(
            admins.map(async (admin) => {
                try {
                    await this.messengerService.sendMessage(
                        admin.chatId,
                        message,
                        { platform: admin.platform },
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
