import { Transform } from 'class-transformer';
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export class LinkOrganizationDto {
    @IsString()
    @Transform(trim)
    @Matches(/^\d{10}(\d{2})?$/)
    inn: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @Matches(/^\d{9}$/)
    kpp?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(15)
    ogrn?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(300)
    organizationName?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(500)
    legalAddress?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(500)
    actualAddress?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(100)
    taxSystem?: string;

    @IsOptional()
    @IsIn(['owner', 'manager', 'accountant', 'employee'])
    role?: 'owner' | 'manager' | 'accountant' | 'employee';

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(120)
    name?: string;
}
