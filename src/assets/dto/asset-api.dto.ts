import { Transform, Type } from 'class-transformer';
import {
    IsDateString,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export class OrganizationIdParamDto {
    @Matches(/^[1-9]\d*$/)
    organizationId: string;
}

export class CashRegisterDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    model?: string;

    @IsString()
    @Transform(trim)
    @MaxLength(200)
    serialNumber: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    registrationNumber?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    fnSerialNumber?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    ofdName?: string;

    @IsOptional()
    @IsDateString()
    registeredAt?: string;
}

export class FiscalDriveDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    cashRegisterId: number;

    @IsString()
    @Transform(trim)
    @MaxLength(200)
    serialNumber: string;

    @IsOptional()
    @IsDateString()
    validFrom?: string;

    @IsOptional()
    @IsDateString()
    validUntil?: string;

    @IsOptional()
    @IsIn(['manual', 'atol_api', 'ofd_api'])
    source?: 'manual' | 'atol_api' | 'ofd_api';
}

export class OfdSubscriptionDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    cashRegisterId?: number;

    @IsString()
    @Transform(trim)
    @MaxLength(200)
    provider: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
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

    @IsOptional()
    @IsIn(['manual', 'atol_api', 'ofd_api'])
    source?: 'manual' | 'atol_api' | 'ofd_api';
}
