import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    CONTENT_PAGE_SIZE_MAX,
    CONTENT_RELATION_LIMIT,
    CONTENT_SLUG_PATTERN,
    KNOWLEDGE_ARTICLE_TYPES,
    SUPPORT_ARCHITECTURES,
    SUPPORT_DISTRIBUTION_MODES,
    SUPPORT_LANGUAGE_CODES,
    SUPPORT_PLATFORMS,
    SUPPORT_RESOURCE_TYPES,
    type KnowledgeArticleType,
    type SupportArchitecture,
    type SupportDistributionMode,
    type SupportLanguageCode,
    type SupportPlatform,
    type SupportResourceType,
} from '../support-knowledge.types';

class PaginationDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(CONTENT_PAGE_SIZE_MAX)
    limit?: number;
}

export class SupportProductListQueryDto extends PaginationDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class SupportResourceListQueryDto extends PaginationDto {
    @IsOptional()
    @IsString()
    @Matches(CONTENT_SLUG_PATTERN)
    @MaxLength(160)
    product?: string;

    @IsOptional()
    @IsIn(SUPPORT_RESOURCE_TYPES)
    type?: SupportResourceType;

    @IsOptional()
    @IsIn(SUPPORT_PLATFORMS)
    platform?: SupportPlatform;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class KnowledgeArticleListQueryDto extends PaginationDto {
    @IsOptional()
    @IsString()
    @Matches(CONTENT_SLUG_PATTERN)
    @MaxLength(160)
    product?: string;

    @IsOptional()
    @IsIn(KNOWLEDGE_ARTICLE_TYPES)
    type?: KnowledgeArticleType;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class UpdateProductSupportProfileDto {
    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    introMarkdown?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    seoTitle?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    seoDescription?: string | null;
}

export class SupportResourceProductDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    productId: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    compatibilityNote?: string | null;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}

export class CreateSupportResourceDto {
    @IsString()
    @Matches(CONTENT_SLUG_PATTERN)
    @MaxLength(160)
    slug: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    summary?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    descriptionMarkdown?: string | null;

    @IsIn(SUPPORT_RESOURCE_TYPES)
    type: SupportResourceType;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    manufacturerName?: string | null;

    @IsOptional()
    @IsBoolean()
    isOfficial?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    sourceName?: string | null;

    @IsOptional()
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @MaxLength(2048)
    sourceUrl?: string | null;

    @IsOptional()
    @IsDateString()
    lastVerifiedAt?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    seoTitle?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    seoDescription?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CONTENT_RELATION_LIMIT)
    @ArrayUnique((item: SupportResourceProductDto) => item.productId)
    @ValidateNested({ each: true })
    @Type(() => SupportResourceProductDto)
    products?: SupportResourceProductDto[];
}

export class UpdateSupportResourceDto extends PartialType(
    CreateSupportResourceDto,
) {}

export class CreateSupportResourceVersionDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    versionLabel?: string | null;

    @IsOptional()
    @IsDateString()
    releaseDate?: string | null;

    @IsIn(SUPPORT_PLATFORMS)
    platform: SupportPlatform;

    @IsIn(SUPPORT_ARCHITECTURES)
    architecture: SupportArchitecture;

    @IsIn(SUPPORT_LANGUAGE_CODES)
    languageCode: SupportLanguageCode;

    @IsIn(SUPPORT_DISTRIBUTION_MODES)
    distributionMode: SupportDistributionMode;

    @IsOptional()
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @MaxLength(2048)
    externalUrl?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    releaseNotesMarkdown?: string | null;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}

export class UpdateSupportResourceVersionDto extends PartialType(
    CreateSupportResourceVersionDto,
) {}

export class CreateKnowledgeArticleDto {
    @IsString()
    @Matches(CONTENT_SLUG_PATTERN)
    @MaxLength(160)
    slug: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    excerpt?: string | null;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100_000)
    bodyMarkdown: string;

    @IsIn(KNOWLEDGE_ARTICLE_TYPES)
    type: KnowledgeArticleType;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    seoTitle?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    seoDescription?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CONTENT_RELATION_LIMIT)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1, { each: true })
    productIds?: number[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CONTENT_RELATION_LIMIT)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1, { each: true })
    resourceIds?: number[];
}

export class UpdateKnowledgeArticleDto extends PartialType(
    CreateKnowledgeArticleDto,
) {}
