import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
} from 'class-validator';
import type { ServiceRequestStatus } from '../entities/service-request.entity';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export class CreateServiceRequestDraftDto {
    @ApiProperty({ example: 'firmware_update', pattern: '^[a-z0-9_]{2,80}$' })
    @IsString()
    @Transform(trim)
    @Matches(/^[a-z0-9_]{2,80}$/)
    serviceTypeCode: string;

    @ApiProperty({
        type: Object,
        description: 'Contact data captured at request creation',
    })
    @IsObject()
    contactSnapshot: Record<string, unknown>;

    @ApiPropertyOptional({
        minimum: 1,
        description: 'Confirmed organization membership only',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    organizationId?: number;

    @ApiPropertyOptional({
        type: Object,
        description: 'Unverified organization data; does not grant access',
    })
    @IsOptional()
    @IsObject()
    organizationSnapshot?: Record<string, unknown>;

    @ApiPropertyOptional({ type: Object })
    @IsOptional()
    @IsObject()
    locationSnapshot?: Record<string, unknown>;

    @ApiPropertyOptional({
        minimum: 1,
        description: 'Existing KKT visible to the current customer',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    cashRegisterId?: number;

    @ApiPropertyOptional({ type: Object })
    @IsOptional()
    @IsObject()
    equipmentSnapshot?: Record<string, unknown>;

    @ApiPropertyOptional({
        type: Object,
        description: 'Structured values keyed by published form field keys',
    })
    @IsOptional()
    @IsObject()
    answers?: Record<string, unknown>;
}

export class UpdateServiceRequestDraftDto {
    @ApiProperty({
        type: Object,
        description: 'Partial structured form values',
    })
    @IsObject()
    answers: Record<string, unknown>;

    @ApiProperty({ minimum: 1, description: 'Optimistic request version' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expectedVersion: number;
}

export class SubmitServiceRequestDto {
    @ApiProperty({ minimum: 1, description: 'Optimistic request version' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expectedVersion: number;

    @ApiProperty({
        minLength: 8,
        maxLength: 120,
        description: 'Customer-scoped submit idempotency key',
    })
    @IsString()
    @Transform(trim)
    @Matches(/^[A-Za-z0-9._:-]{8,120}$/)
    idempotencyKey: string;
}

export class ServiceRequestMessageDto {
    @ApiProperty({ maxLength: 10_000 })
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    text: string;
}

export class AdminServiceRequestMessageDto extends ServiceRequestMessageDto {
    @ApiPropertyOptional({
        enum: ['customer', 'internal'],
        default: 'customer',
    })
    @IsOptional()
    @IsIn(['customer', 'internal'])
    visibility?: 'customer' | 'internal';
}

export class AdminCreateServiceRequestDto extends CreateServiceRequestDraftDto {
    @ApiProperty({ enum: ['admin', 'phone'] })
    @IsIn(['admin', 'phone'])
    source: 'admin' | 'phone';

    @ApiPropertyOptional({ enum: ['draft', 'submitted', 'review_required'] })
    @IsOptional()
    @IsIn(['draft', 'submitted', 'review_required'])
    initialStatus?: 'draft' | 'submitted' | 'review_required';
}

const ADMIN_TRANSITIONS: ServiceRequestStatus[] = [
    'submitted',
    'review_required',
    'clarification_required',
    'invoice_required',
    'waiting_payment',
    'paid',
    'scheduled',
    'in_progress',
    'completed',
    'closed',
    'cancelled',
];

export class AdminTransitionServiceRequestDto {
    @ApiProperty({ enum: ADMIN_TRANSITIONS })
    @IsIn(ADMIN_TRANSITIONS)
    status: ServiceRequestStatus;

    @ApiPropertyOptional({
        minimum: 1,
        description: 'Optimistic request version',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expectedVersion?: number;
}

export class PublicServiceRequestTokenParamDto {
    @ApiProperty({
        minLength: 32,
        maxLength: 100,
        description:
            'Unpredictable bearer token; request number is not accepted',
    })
    @Matches(/^[A-Za-z0-9_-]{32,100}$/)
    token: string;
}

export class PublicServiceRequestAttachmentParamDto extends PublicServiceRequestTokenParamDto {
    @ApiProperty({ minimum: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    attachmentId: number;
}
