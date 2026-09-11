import { Type } from 'class-transformer';
import {
    IsDateString,
    IsDefined,
    IsIn,
    IsInt,
    IsOptional,
    Max,
    Min,
    ValidateBy,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import type { RegistrationPrecondition } from './registration-admin-policy';
import type {
    RegistrationRequestPriority,
    RegistrationRequestStatus,
} from './entities/registration.entity';
import type {
    OfdProvisionMode,
    RegistrationReadiness,
} from './registration.types';

export const REGISTRATION_ID_MAX = 2_147_483_647;
const maximumPathId = String(REGISTRATION_ID_MAX);

export function IsRegistrationPathId() {
    return ValidateBy({
        name: 'isRegistrationPathId',
        validator: {
            validate: (value: unknown) =>
                typeof value === 'string' &&
                /^[1-9][0-9]{0,9}$/.test(value) &&
                (value.length < maximumPathId.length || value <= maximumPathId),
            defaultMessage: () =>
                '$property must be a decimal ID between 1 and 2147483647',
        },
    });
}

export class RegistrationIdParamDto {
    @IsRegistrationPathId()
    id: string;
}

class RequirementVersionsDto {
    @IsInt() @Min(1) @Max(2147483647) kkt_serial: number;
    @IsInt() @Min(1) @Max(2147483647) fiscal_drive_serial: number;
    @IsInt() @Min(1) @Max(2147483647) ofd_code: number;
}
export class RegistrationPreconditionDto implements RegistrationPrecondition {
    @IsIn(['draft', 'new', 'in_work', 'processed'])
    expectedStatus: RegistrationRequestStatus;
    @ValidateIf((_object, value) => value !== null)
    @IsDateString()
    expectedHandedOffAt: string | null;
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(2147483647)
    expectedRequirementVersion?: number;
    @IsOptional()
    @ValidateNested()
    @Type(() => RequirementVersionsDto)
    expectedRequirementVersions?: RequirementVersionsDto;
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    expectedPriority?: RegistrationRequestPriority;
    @IsOptional()
    @IsIn([
        'customer_has_code',
        'purchase_from_vitma',
        'clarification_required',
        'not_applicable',
    ])
    expectedOfdMode?: OfdProvisionMode;
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(REGISTRATION_ID_MAX)
    expectedKitId?: number | null;
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(REGISTRATION_ID_MAX)
    expectedEngineerId?: number | null;
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(REGISTRATION_ID_MAX)
    expectedPdfFileId?: number | null;
}
export class RegistrationAdminCommandDto {
    @IsDefined()
    @ValidateNested()
    @Type(() => RegistrationPreconditionDto)
    precondition: RegistrationPreconditionDto;
}
export class RegistrationEquipmentKitDto extends RegistrationAdminCommandDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(REGISTRATION_ID_MAX)
    kitId: number;
}
export class RegistrationListQueryDto {
    @IsOptional() @IsIn(['new', 'in_work', 'processed', 'all']) status?:
        | 'new'
        | 'in_work'
        | 'processed'
        | 'all';
    @IsOptional() @IsIn(['web', 'telegram', 'max']) platform?:
        | 'web'
        | 'telegram'
        | 'max';
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: RegistrationRequestPriority;
    @IsOptional()
    @IsIn(['incomplete', 'awaiting_customer', 'awaiting_verification', 'ready'])
    readiness?: RegistrationReadiness;
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100000)
    page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
