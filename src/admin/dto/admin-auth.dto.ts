import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsString,
    Length,
    Matches,
    MaxLength,
} from 'class-validator';
import { ADMIN_ROLES, AdminRole } from '../entities/admin-user-role.entity';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AdminLoginDto {
    @IsString()
    @Transform(trimLower)
    @Length(1, 100)
    login: string;

    @IsString()
    @Length(1, 128)
    password: string;
}

export class CreateAdminUserDto {
    @IsString()
    @Transform(trimLower)
    @Matches(/^[a-z0-9][a-z0-9._-]{2,63}$/)
    login: string;

    @IsString()
    @Transform(trim)
    @Length(2, 120)
    displayName: string;

    @IsString()
    @Length(12, 128)
    password: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(4)
    @IsEnum(ADMIN_ROLES, { each: true })
    roles: AdminRole[];
}

export class SetAdminRolesDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(4)
    @IsEnum(ADMIN_ROLES, { each: true })
    roles: AdminRole[];
}

export class SetAdminActiveDto {
    @IsBoolean()
    isActive: boolean;
}

export class ResetAdminPasswordDto {
    @IsString()
    @Length(12, 128)
    password: string;
}

export class NotificationBindCodeDto {
    @IsEnum(['telegram', 'max'])
    platform: 'telegram' | 'max';
}

export class NotificationSettingsDto {
    @IsBoolean()
    notifyRegistrations: boolean;

    @IsBoolean()
    notifyTickets: boolean;

    @IsBoolean()
    notifyServiceRequests: boolean;
}

export class AdminIdParamDto {
    @Matches(/^[1-9]\d*$/)
    id: string;
}

export class OptionalOperatorCommentDto {
    @IsString()
    @MaxLength(10_000)
    operatorComment: string;
}
