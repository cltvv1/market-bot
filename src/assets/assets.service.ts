import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { CashRegisterEntity } from './entities/cash-register.entity';
import { FiscalDriveEntity, AssetDataSource } from './entities/fiscal-drive.entity';
import { OfdSubscriptionEntity, OfdSubscriptionStatus } from './entities/ofd-subscription.entity';

interface ClientAssetScope {
    chatId: string;
    platform: UserPlatform;
    organizationId: number;
}

export interface UpsertCashRegisterInput extends ClientAssetScope {
    model?: string;
    serialNumber: string;
    registrationNumber?: string;
    fnSerialNumber?: string;
    ofdName?: string;
    registeredAt?: string;
}

export interface UpsertFiscalDriveInput extends ClientAssetScope {
    cashRegisterId: number;
    serialNumber: string;
    validFrom?: string;
    validUntil?: string;
    source?: AssetDataSource;
}

export interface UpsertOfdSubscriptionInput extends ClientAssetScope {
    cashRegisterId?: number;
    provider: string;
    contractNumber?: string;
    validFrom?: string;
    validUntil?: string;
    status?: OfdSubscriptionStatus;
    source?: AssetDataSource;
}

@Injectable()
export class AssetsService {
    constructor(
        @InjectRepository(CashRegisterEntity)
        private readonly cashRegistersRepo: Repository<CashRegisterEntity>,
        @InjectRepository(FiscalDriveEntity)
        private readonly fiscalDrivesRepo: Repository<FiscalDriveEntity>,
        @InjectRepository(OfdSubscriptionEntity)
        private readonly ofdSubscriptionsRepo: Repository<OfdSubscriptionEntity>,
        private readonly organizationsService: OrganizationsService,
    ) { }

    async getOrganizationAssets(chatId: string, platform: UserPlatform, organizationId: number) {
        await this.organizationsService.assertUserOrganization(chatId, platform, organizationId);

        const [cashRegisters, fiscalDrives, ofdSubscriptions] = await Promise.all([
            this.cashRegistersRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
            this.fiscalDrivesRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
            this.ofdSubscriptionsRepo.find({ where: { organizationId }, order: { id: 'ASC' } }),
        ]);

        return { cashRegisters, fiscalDrives, ofdSubscriptions };
    }

    async upsertCashRegister(input: UpsertCashRegisterInput) {
        await this.organizationsService.assertUserOrganization(input.chatId, input.platform, input.organizationId);
        const serialNumber = this.required(input.serialNumber, 'serialNumber');

        let cashRegister = await this.cashRegistersRepo.findOne({
            where: { organizationId: input.organizationId, serialNumber },
        });

        if (!cashRegister) {
            cashRegister = this.cashRegistersRepo.create({
                organizationId: input.organizationId,
                serialNumber,
                status: 'active',
            });
        }

        cashRegister.model = input.model?.trim() || cashRegister.model;
        cashRegister.registrationNumber = input.registrationNumber?.trim() || cashRegister.registrationNumber;
        cashRegister.fnSerialNumber = input.fnSerialNumber?.trim() || cashRegister.fnSerialNumber;
        cashRegister.ofdName = input.ofdName?.trim() || cashRegister.ofdName;
        cashRegister.registeredAt = this.parseOptionalDate(input.registeredAt) ?? cashRegister.registeredAt;

        return this.cashRegistersRepo.save(cashRegister);
    }

    async upsertFiscalDrive(input: UpsertFiscalDriveInput) {
        await this.organizationsService.assertUserOrganization(input.chatId, input.platform, input.organizationId);
        await this.assertCashRegister(input.organizationId, input.cashRegisterId);
        const serialNumber = this.required(input.serialNumber, 'serialNumber');

        let fiscalDrive = await this.fiscalDrivesRepo.findOne({
            where: { cashRegisterId: input.cashRegisterId, serialNumber },
        });

        if (!fiscalDrive) {
            fiscalDrive = this.fiscalDrivesRepo.create({
                organizationId: input.organizationId,
                cashRegisterId: input.cashRegisterId,
                serialNumber,
                source: input.source ?? 'manual',
            });
        }

        fiscalDrive.validFrom = this.parseOptionalDate(input.validFrom) ?? fiscalDrive.validFrom;
        fiscalDrive.validUntil = this.parseOptionalDate(input.validUntil) ?? fiscalDrive.validUntil;
        fiscalDrive.source = input.source ?? fiscalDrive.source;

        return this.fiscalDrivesRepo.save(fiscalDrive);
    }

    async upsertOfdSubscription(input: UpsertOfdSubscriptionInput) {
        await this.organizationsService.assertUserOrganization(input.chatId, input.platform, input.organizationId);
        if (input.cashRegisterId) {
            await this.assertCashRegister(input.organizationId, input.cashRegisterId);
        }

        const provider = this.required(input.provider, 'provider');
        const ofdSubscription = this.ofdSubscriptionsRepo.create({
            organizationId: input.organizationId,
            cashRegisterId: input.cashRegisterId,
            provider,
            contractNumber: input.contractNumber?.trim() || null,
            validFrom: this.parseOptionalDate(input.validFrom),
            validUntil: this.parseOptionalDate(input.validUntil),
            status: input.status ?? 'unknown',
            source: input.source ?? 'manual',
        });

        return this.ofdSubscriptionsRepo.save(ofdSubscription);
    }

    private async assertCashRegister(organizationId: number, cashRegisterId: number) {
        const cashRegister = await this.cashRegistersRepo.findOne({
            where: { id: cashRegisterId, organizationId },
        });

        if (!cashRegister) {
            throw new NotFoundException('Cash register is not linked to this organization');
        }

        return cashRegister;
    }

    private required(value: string | undefined, fieldName: string) {
        const normalized = value?.trim();
        if (!normalized) {
            throw new BadRequestException(`${fieldName} is required`);
        }

        return normalized;
    }

    private parseOptionalDate(value?: string) {
        if (!value?.trim()) return null;

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException('Invalid date value');
        }

        return date;
    }
}
