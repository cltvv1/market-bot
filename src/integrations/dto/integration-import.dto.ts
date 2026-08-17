import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { INTEGRATION_PROVIDERS } from '../integration.types';

class ExternalRecordDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    externalId: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    externalRevision?: string;

    @IsOptional()
    @IsDateString()
    sourceUpdatedAt?: string;
}

export class IntegrationOrganizationDto extends ExternalRecordDto {
    @IsString()
    @MaxLength(12)
    inn: string;

    @IsOptional()
    @IsString()
    @MaxLength(9)
    kpp?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    ogrn?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    legalAddress?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    actualAddress?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    taxSystem?: string;
}

export class IntegrationCashRegisterDto extends ExternalRecordDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organizationExternalId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(12)
    organizationInn?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    serialNumber: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    registrationNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    model?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    installationAddress?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    status?: string;

    @IsOptional()
    @IsDateString()
    registeredAt?: string;
}

export class IntegrationFiscalDriveDto extends ExternalRecordDto {
    @IsString()
    @MaxLength(255)
    cashRegisterExternalId: string;

    @IsString()
    @MaxLength(255)
    serialNumber: string;

    @IsOptional()
    @IsDateString()
    validFrom?: string;

    @IsOptional()
    @IsDateString()
    validUntil?: string;
}

export class IntegrationOfdSubscriptionDto extends ExternalRecordDto {
    @IsString()
    @MaxLength(255)
    cashRegisterExternalId: string;

    @IsString()
    @MaxLength(255)
    providerName: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    contractNumber?: string;

    @IsOptional()
    @IsDateString()
    validFrom?: string;

    @IsOptional()
    @IsDateString()
    validUntil?: string;

    @IsOptional()
    @IsIn(['active', 'expired', 'unknown'])
    status?: 'active' | 'expired' | 'unknown';
}

export class IntegrationContactDto extends ExternalRecordDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organizationExternalId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(12)
    organizationInn?: string;

    @IsIn(['phone', 'email'])
    kind: 'phone' | 'email';

    @IsString()
    @MaxLength(320)
    value: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    quality?: string;
}

export class IntegrationObservationDto extends ExternalRecordDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organizationExternalId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(12)
    organizationInn?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    cashRegisterExternalId?: string;

    @IsString()
    @MaxLength(128)
    type: string;

    @IsString()
    @MaxLength(255)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    description?: string;

    @IsOptional()
    @IsIn(['info', 'low', 'normal', 'high', 'urgent'])
    severity?: 'info' | 'low' | 'normal' | 'high' | 'urgent';

    @IsOptional()
    @IsIn(['active', 'resolved'])
    status?: 'active' | 'resolved';

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;
}

export class IntegrationImportDto {
    @IsIn(INTEGRATION_PROVIDERS)
    provider: 'atol_connect' | 'platforma_ofd';

    @IsString()
    @MaxLength(128)
    kind: string;

    @IsOptional()
    @IsIn(['shadow', 'apply'])
    mode?: 'shadow' | 'apply';

    @IsOptional()
    @IsString()
    @MaxLength(255)
    sourceCursor?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    syncId?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    batchIndex?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    batchCount?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationOrganizationDto)
    organizations: IntegrationOrganizationDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationCashRegisterDto)
    cashRegisters: IntegrationCashRegisterDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationFiscalDriveDto)
    fiscalDrives: IntegrationFiscalDriveDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationOfdSubscriptionDto)
    ofdSubscriptions: IntegrationOfdSubscriptionDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationContactDto)
    contacts: IntegrationContactDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => IntegrationObservationDto)
    observations: IntegrationObservationDto[];
}

export class OpportunityListQueryDto {
    @IsOptional()
    @IsIn([
        'new',
        'in_progress',
        'contact_later',
        'converted',
        'resolved',
        'not_relevant',
        'all',
    ])
    status?: string;

    @IsOptional()
    @IsIn(['atol_connect', 'platforma_ofd'])
    provider?: string;

    @IsOptional()
    @IsString()
    search?: string;
}

export class UpdateOpportunityDto {
    @IsOptional()
    @IsIn(['new', 'in_progress', 'contact_later', 'resolved', 'not_relevant'])
    status?:
        | 'new'
        | 'in_progress'
        | 'contact_later'
        | 'resolved'
        | 'not_relevant';

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    comment?: string;

    @IsOptional()
    @IsDateString()
    callbackAt?: string;

    @IsOptional()
    @IsInt()
    assignedAdminId?: number;
}

export class CreateIntegrationExclusionDto {
    @IsString()
    @MaxLength(12)
    inn: string;

    @IsOptional()
    @IsIn(INTEGRATION_PROVIDERS)
    provider?: 'atol_connect' | 'platforma_ofd';

    @IsOptional()
    @IsString()
    @MaxLength(128)
    observationType?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reason?: string;
}

export class UpdateIntegrationExclusionDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reason?: string;
}
