import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    Validate,
    ValidatorConstraint,
    type ValidatorConstraintInterface,
} from 'class-validator';
import {
    CATALOG_AVAILABILITY_STATUSES,
    CATALOG_PAGE_SIZE_MAX,
    CATALOG_PRICE_MINOR_MAX,
    CATALOG_VAT_RATES,
    type CatalogAvailabilityStatus,
    type CatalogVatRate,
} from '../catalog.types';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@ValidatorConstraint({ name: 'catalogSpecifications', async: false })
class CatalogSpecificationsConstraint implements ValidatorConstraintInterface {
    validate(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        const entries = Object.entries(value as Record<string, unknown>);
        return (
            entries.length <= 50 &&
            entries.every(
                ([key, item]) =>
                    key.length >= 1 &&
                    key.length <= 100 &&
                    typeof item === 'string' &&
                    item.length <= 500,
            )
        );
    }

    defaultMessage() {
        return 'specifications must contain at most 50 string values with bounded keys and values';
    }
}

class CatalogContentDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(30)
    @IsString({ each: true })
    @MaxLength(500, { each: true })
    features?: string[];

    @IsOptional()
    @IsObject()
    @Validate(CatalogSpecificationsConstraint)
    specifications?: Record<string, string>;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(500, { each: true })
    packageContents?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(30)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @MaxLength(160, { each: true })
    aliases?: string[];
}

export class CreateCatalogCategoryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    parentId?: number | null;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(160)
    slug: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    description?: string | null;

    @IsOptional()
    @IsInt()
    sortOrder?: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    oneCRef?: string | null;
}

export class UpdateCatalogCategoryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    parentId?: number | null;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(160)
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    description?: string | null;

    @IsOptional()
    @IsInt()
    sortOrder?: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    oneCRef?: string | null;
}

export class CreateCatalogProductDto extends CatalogContentDto {
    @IsInt()
    @Min(1)
    categoryId: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    sku: string;

    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(160)
    slug: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    brand?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    shortDescription?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    description?: string | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(CATALOG_PRICE_MINOR_MAX)
    displayPriceMinor?: number | null;

    @IsOptional()
    @IsIn(CATALOG_VAT_RATES)
    vatRate?: CatalogVatRate;

    @IsOptional()
    @IsIn(CATALOG_AVAILABILITY_STATUSES)
    availabilityStatus?: CatalogAvailabilityStatus;

    @IsOptional()
    @IsBoolean()
    isPopular?: boolean;

    @IsOptional()
    @IsBoolean()
    isNew?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    oneCRef?: string | null;
}

export class UpdateCatalogProductDto extends CatalogContentDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    categoryId?: number;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    sku?: string;

    @IsOptional()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(160)
    slug?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    brand?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    shortDescription?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    description?: string | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(CATALOG_PRICE_MINOR_MAX)
    displayPriceMinor?: number | null;

    @IsOptional()
    @IsIn(CATALOG_VAT_RATES)
    vatRate?: CatalogVatRate;

    @IsOptional()
    @IsIn(CATALOG_AVAILABILITY_STATUSES)
    availabilityStatus?: CatalogAvailabilityStatus;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    isPopular?: boolean;

    @IsOptional()
    @IsBoolean()
    isNew?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    oneCRef?: string | null;
}

export class CatalogProductListQueryDto {
    @IsOptional()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(160)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @IsOptional()
    @IsIn(CATALOG_AVAILABILITY_STATUSES)
    availability?: CatalogAvailabilityStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(CATALOG_PAGE_SIZE_MAX)
    limit?: number;
}
