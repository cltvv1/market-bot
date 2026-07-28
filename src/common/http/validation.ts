import {
    BadRequestException,
    ValidationError,
    ValidationPipe,
} from '@nestjs/common';

interface ValidationDetail {
    field: string;
    code: string;
    message: string;
}

function flatten(
    errors: ValidationError[],
    parent = '',
): ValidationDetail[] {
    return errors.flatMap((error) => {
        const field = parent ? `${parent}.${error.property}` : error.property;
        const own = Object.entries(error.constraints || {}).map(
            ([code, message]) => ({
                field,
                code: code.toUpperCase(),
                message,
            }),
        );
        return [...own, ...flatten(error.children || [], field)];
    });
}

export function createValidationPipe() {
    return new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: (validationErrors) =>
            new BadRequestException({
                code: 'VALIDATION_ERROR',
                message: 'Некоторые поля заполнены неверно',
                errors: flatten(validationErrors),
            }),
    });
}
