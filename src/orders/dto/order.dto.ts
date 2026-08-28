import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDefined,
    IsEmail,
    IsIn,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
    ValidateIf,
} from 'class-validator';
import {
    ORDER_CUSTOMER_TYPES,
    ORDER_DELIVERY_TYPES,
    ORDER_ITEM_COUNT_MAX,
    ORDER_ITEM_QUANTITY_MAX,
    ORDER_PAGE_NUMBER_MAX,
    ORDER_PAGE_SIZE_MAX,
    ORDER_ASSIGNMENT_SCOPES,
    ORDER_INTERNAL_COMMENT_MAX_LENGTH,
    ORDER_PAYMENT_COMMENT_MAX_LENGTH,
    ORDER_PAYMENT_SOURCES,
    ORDER_STATUSES,
    POSTGRES_INTEGER_MAX,
    type OrderCustomerType,
    type OrderDeliveryType,
    type OrderStatus,
    type OrderAssignmentScope,
    type OrderPaymentSource,
} from '../order.types';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;
const trimLowercase = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class OrderContactDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    name: string;

    @Transform(trim)
    @IsString()
    @Matches(/^[+()\d\s-]{5,30}$/)
    @MaxLength(30)
    phone: string;

    @IsOptional()
    @Transform(trimLowercase)
    @IsEmail()
    @MaxLength(254)
    email?: string | null;
}

export class OrderOrganizationDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(300)
    name: string;

    @Transform(trim)
    @IsString()
    @Matches(/^\d{10}(\d{2})?$/)
    inn: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^\d{9}$/)
    kpp?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^(\d{13}|\d{15})$/)
    ogrn?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    legalAddress?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    actualAddress?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    taxSystem?: string | null;
}

export class OrderDeliveryDto {
    @IsIn(ORDER_DELIVERY_TYPES)
    type: OrderDeliveryType;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(160)
    city?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    address?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    comment?: string | null;
}

export class OrderItemDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    productId: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(ORDER_ITEM_QUANTITY_MAX)
    quantity: number;
}

export class SubmitOrderDto {
    @IsIn(ORDER_CUSTOMER_TYPES)
    customerType: OrderCustomerType;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    organizationId?: number;

    @IsOptional()
    @ValidateNested()
    @Type(() => OrderOrganizationDto)
    organization?: OrderOrganizationDto;

    @IsDefined()
    @ValidateNested()
    @Type(() => OrderContactDto)
    contact: OrderContactDto;

    @IsDefined()
    @ValidateNested()
    @Type(() => OrderDeliveryDto)
    delivery: OrderDeliveryDto;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    comment?: string | null;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(ORDER_ITEM_COUNT_MAX)
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];
}

export class ClientOrderListQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(ORDER_PAGE_NUMBER_MAX)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(ORDER_PAGE_SIZE_MAX)
    limit?: number;

    @IsOptional()
    @IsIn(ORDER_STATUSES)
    status?: OrderStatus;
}

export class OrderIdParamDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    id: number;
}

export class OrderDocumentIdParamDto extends OrderIdParamDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    documentId: number;
}

export class AdminOrderListQueryDto extends ClientOrderListQueryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    search?: string;

    @IsOptional()
    @IsIn(ORDER_ASSIGNMENT_SCOPES)
    scope?: OrderAssignmentScope;
}

export class OrderExpectedVersionDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    expectedVersion: number;
}

export class AssignOrderDto extends OrderExpectedVersionDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    managerId: number;
}

export class OrderQuoteLineDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POSTGRES_INTEGER_MAX)
    productId: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(ORDER_ITEM_QUANTITY_MAX)
    quantity: number;

    @Transform(trim)
    @ValidateIf((_object, value) => value !== null)
    @IsString()
    @Matches(/^\d+$/)
    @MaxLength(20)
    quotedUnitPriceMinor: string | null;
}

export class UpdateOrderQuoteDto extends OrderExpectedVersionDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(ORDER_INTERNAL_COMMENT_MAX_LENGTH)
    internalComment?: string | null;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(ORDER_ITEM_COUNT_MAX)
    @ValidateNested({ each: true })
    @Type(() => OrderQuoteLineDto)
    lines: OrderQuoteLineDto[];
}

export class ConfirmOrderPaymentDto extends OrderExpectedVersionDto {
    @IsIn(ORDER_PAYMENT_SOURCES)
    source: OrderPaymentSource;

    @IsOptional()
    @IsISO8601({ strict: true, strictSeparator: true })
    paymentReceivedAt?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(ORDER_PAYMENT_COMMENT_MAX_LENGTH)
    comment?: string | null;
}
