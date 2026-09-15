import { Transform } from 'class-transformer';
import {
    IsDateString,
    IsIn,
    IsInt,
    IsObject,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    IsRegistrationPathId,
    RegistrationIdParamDto,
} from './registration-admin.dto';
import type { RegistrationRequirementKind } from './registration.types';

export class RegistrationDraftSubmitDto {
    @IsDateString({ strict: true }) expectedUpdatedAt: string;
}
export class RegistrationDraftSaveDto extends RegistrationDraftSubmitDto {
    @IsObject() values: Record<string, string>;
}
export class RegistrationClientRequirementParams extends RegistrationIdParamDto {
    @IsIn(['kkt_serial', 'fiscal_drive_serial', 'ofd_code'])
    kind: RegistrationRequirementKind;
}
export class RegistrationClientEvidenceParams extends RegistrationIdParamDto {
    @IsRegistrationPathId() evidenceId: string;
}
export class RegistrationEvidenceVersionDto {
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value)
            ? Number(value)
            : value,
    )
    @IsInt()
    @Min(1)
    @Max(2147483647)
    expectedRequirementVersion: number;
}
export class RegistrationClientValueDto extends RegistrationEvidenceVersionDto {
    @IsString() @MaxLength(500) value: string;
}
