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

export class PositiveIdParamDto {
    @Matches(/^[1-9]\d*$/)
    id: string;
}

export class AdminListQueryDto {
    @IsOptional()
    @IsIn(['all', 'new', 'in_work', 'processed'])
    status?: 'all' | 'new' | 'in_work' | 'processed';

    @IsOptional()
    @IsIn(['telegram', 'max', 'web'])
    platform?: 'telegram' | 'max' | 'web';

    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export class AuditListQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    actorStaffId?: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    action?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    targetType?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    targetId?: string;

    @IsOptional()
    @IsIn(['success', 'denied', 'failure'])
    result?: 'success' | 'denied' | 'failure';

    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;
}

export class ServiceRequestListQueryDto {
    @IsOptional()
    @IsIn([
        'active',
        'all',
        'draft',
        'submitted',
        'price_confirmed',
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
    ])
    status?:
        | 'active'
        | 'all'
        | 'draft'
        | 'submitted'
        | 'price_confirmed'
        | 'review_required'
        | 'clarification_required'
        | 'invoice_required'
        | 'waiting_payment'
        | 'paid'
        | 'scheduled'
        | 'in_progress'
        | 'completed'
        | 'closed'
        | 'cancelled';

    @IsOptional()
    @IsIn(['telegram', 'max', 'web'])
    platform?: 'telegram' | 'max' | 'web';
}

export class CustomerContextQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    userId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    organizationId?: number;

    @IsOptional()
    @IsIn(['telegram', 'max', 'web'])
    platform?: 'telegram' | 'max' | 'web';

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    chatId?: string;
}

export class ActivityQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    userId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    organizationId?: number;
}

export class SearchQueryDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    q?: string;
}

export class OrganizationAccessListQueryDto {
    @IsOptional()
    @IsIn(['all', 'pending', 'approved', 'rejected', 'cancelled'])
    status?: 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export class OrganizationAccessReviewDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(1000)
    reviewComment?: string;
}

export class ScheduleServiceRequestDto {
    @IsString()
    @Transform(trim)
    @MaxLength(500)
    visitAddress: string;

    @IsOptional()
    @IsDateString()
    visitTime?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    operatorComment?: string;
}

export class ServiceRequestOperatorStateDto {
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: 'low' | 'normal' | 'high' | 'urgent';

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    operatorComment?: string | null;
}

export class AssignEngineerDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    assignedEngineerId: number;
}

export class EquipmentKitDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    cashRegisterModel?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    cashRegisterSerial?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    fiscalDriveSerial?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(500)
    ofdActivationCode?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(200)
    marketplaceOrderId?: string;

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(2_000)
    comment?: string;
}

export class LinkEquipmentKitDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    kitId: number;
}

export class RegistrationOperatorStateDto {
    @IsOptional()
    @IsIn(['new', 'in_work'])
    status?: 'new' | 'in_work';

    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export class RegistrationRequirementActionDto {
    @IsIn(['kkt_serial', 'fiscal_drive_serial', 'ofd_code'])
    kind: 'kkt_serial' | 'fiscal_drive_serial' | 'ofd_code';

    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(2_000)
    comment?: string;
}

export class RegistrationOperatorValueDto extends RegistrationRequirementActionDto {
    @IsString()
    @Transform(trim)
    @MaxLength(500)
    value: string;

    @IsOptional()
    @IsIn(['operator_input', 'sold_by_vitma'])
    source?: 'operator_input' | 'sold_by_vitma';
}

export class RegistrationEvidenceParamsDto extends PositiveIdParamDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    evidenceId: number;
}

export class RegistrationEvidenceLinkDto extends RegistrationRequirementActionDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    evidenceId: number;
}

export class RegistrationRequestDataDto extends RegistrationRequirementActionDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(2_000)
    text?: string;
}

export class RegistrationNotRequiredDto extends RegistrationRequirementActionDto {
    @IsString()
    @Transform(trim)
    @MaxLength(1_000)
    reason: string;
}

export class RegistrationOfdModeDto {
    @IsIn([
        'customer_has_code',
        'purchase_from_vitma',
        'clarification_required',
        'not_applicable',
    ])
    mode:
        | 'customer_has_code'
        | 'purchase_from_vitma'
        | 'clarification_required'
        | 'not_applicable';
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(1_000)
    reason?: string;
}

export class RegistrationHandoffDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    engineerId?: number;
}

export class TextMessageDto {
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    text: string;
}

export class OptionalMediaTextDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(2_000)
    text?: string;
}
