import { Transform, Type } from 'class-transformer';
import {
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    Validate,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import type { RegistrationField } from 'src/registrations/registration.types';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

const REGISTRATION_FIELDS = new Set<RegistrationField>([
    'orgName',
    'ogrn',
    'innKpp',
    'urAdress',
    'kktAdress',
    'kktName',
    'phone',
    'phoneToCall',
    'email',
    'nds',
    'excise',
    'markirovka',
    'services',
    'strictReporting',
    'taxSystem',
    'kktModel',
    'bankReqs',
    'ofd',
    'equipmentPhoto',
]);

@ValidatorConstraint({ name: 'registrationValues', async: false })
export class RegistrationValuesConstraint
    implements ValidatorConstraintInterface
{
    validate(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        const entries = Object.entries(value);
        return (
            entries.length <= REGISTRATION_FIELDS.size &&
            entries.every(
                ([key, item]) =>
                    REGISTRATION_FIELDS.has(key as RegistrationField) &&
                    typeof item === 'string' &&
                    item.length <= 10_000,
            )
        );
    }

    defaultMessage() {
        return 'Registration values contain an unsupported field or value';
    }
}

export class ClientContextDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    organizationId?: number;
}

export class RegistrationAnswerDto extends ClientContextDto {
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    value: string;
}

export class RegistrationFormDto extends ClientContextDto {
    @IsObject()
    @Validate(RegistrationValuesConstraint)
    values: Partial<Record<RegistrationField, string>>;
}

export class ServiceRequestStartDto extends ClientContextDto {
    @IsString()
    @Transform(trim)
    @Matches(/^[a-z0-9_]{2,80}$/)
    serviceTypeCode: string;
}

export class ServiceRequestAnswerDto extends ClientContextDto {
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    value: string;
}

export class TicketMessageDto extends ClientContextDto {
    @IsString()
    @Transform(trim)
    @MaxLength(10_000)
    text: string;
}

export class TicketMediaDto extends ClientContextDto {
    @IsOptional()
    @IsString()
    @Transform(trim)
    @MaxLength(2_000)
    text?: string;
}

export class ClientIdParamDto {
    @Matches(/^[1-9]\d*$/)
    id: string;
}
