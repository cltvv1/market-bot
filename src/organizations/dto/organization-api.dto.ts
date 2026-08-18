import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export class LinkOrganizationDto {
    @ApiProperty({ example: '2460000000', pattern: '^\\d{10}(\\d{2})?$' })
    @IsString()
    @Transform(trim)
    @Matches(/^\d{10}(\d{2})?$/)
    inn: string;

    @IsOptional()
    @ApiPropertyOptional({ pattern: '^\\d{9}$' })
    @IsString()
    @Transform(trim)
    @Matches(/^\d{9}$/)
    kpp?: string;

    @IsOptional()
    @ApiPropertyOptional({ maxLength: 300 })
    @IsString()
    @Transform(trim)
    @MaxLength(300)
    organizationName?: string;

    @IsOptional()
    @ApiPropertyOptional({ maxLength: 120 })
    @IsString()
    @Transform(trim)
    @MaxLength(120)
    name?: string;

    @ApiPropertyOptional({ maxLength: 30 })
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(30)
    phone?: string;

    @ApiPropertyOptional({ maxLength: 254 })
    @IsOptional()
    @IsEmail()
    @Transform(trim)
    @MaxLength(254)
    email?: string;

    @ApiPropertyOptional({ maxLength: 1000 })
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(1000)
    comment?: string;
}

export class OrganizationAccessPublicOrganizationDto {
    @ApiProperty() id: number;
    @ApiProperty({ nullable: true }) name: string | null;
    @ApiProperty({ example: '******0000' }) inn: string;
}

export class OrganizationAccessPublicResponseDto {
    @ApiProperty() id: number;
    @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    status: string;
    @ApiProperty({ enum: ['representative'] }) requestedRole: 'representative';
    @ApiProperty({ type: OrganizationAccessPublicOrganizationDto })
    organization: OrganizationAccessPublicOrganizationDto;
    @ApiPropertyOptional({ nullable: true }) submittedName?: string | null;
    @ApiPropertyOptional({ nullable: true }) submittedPhone?: string | null;
    @ApiPropertyOptional({ nullable: true }) submittedEmail?: string | null;
    @ApiPropertyOptional({ nullable: true }) comment?: string | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
    @ApiProperty({ nullable: true }) reviewedAt: Date | null;
    @ApiProperty({ nullable: true }) cancelledAt: Date | null;
}

export class OrganizationAccessAdminResponseDto {
    @ApiProperty() id: number;
    @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    status: string;
    @ApiProperty({ enum: ['representative'] }) requestedRole: 'representative';
    @ApiProperty({ type: Object, nullable: true })
    organization: Record<string, unknown> | null;
    @ApiProperty({ type: Object, nullable: true })
    customer: Record<string, unknown> | null;
    @ApiProperty({ type: Object, nullable: true })
    reviewer: Record<string, unknown> | null;
    @ApiPropertyOptional({ nullable: true }) submittedName?: string | null;
    @ApiPropertyOptional({ nullable: true }) submittedPhone?: string | null;
    @ApiPropertyOptional({ nullable: true }) submittedEmail?: string | null;
    @ApiPropertyOptional({ nullable: true }) comment?: string | null;
    @ApiPropertyOptional({ nullable: true }) reviewComment?: string | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
    @ApiProperty({ nullable: true }) reviewedAt: Date | null;
    @ApiProperty({ nullable: true }) cancelledAt: Date | null;
}
