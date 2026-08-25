import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorDetail {
    field?: string;
    code: string;
    message: string;
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiErrorFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const context = host.switchToHttp();
        const request = context.getRequest<Request & { requestId?: string }>();
        const response = context.getResponse<Response>();
        const multipart = this.multipartError(exception);
        const status = multipart
            ? multipart.status
            : exception instanceof HttpException
              ? exception.getStatus()
              : HttpStatus.INTERNAL_SERVER_ERROR;
        const payload = multipart
            ? multipart.payload
            : exception instanceof HttpException
              ? exception.getResponse()
              : null;

        if (status >= 500) {
            this.logger.error(
                `${request.method} ${request.originalUrl}`,
                exception instanceof Error
                    ? exception.stack
                    : String(exception),
            );
        }

        const normalized = this.normalize(status, payload);
        response.status(status).json({
            statusCode: status,
            code: normalized.code,
            message: normalized.message,
            errors: normalized.errors,
            requestId: request.requestId || response.getHeader('x-request-id'),
        });
    }

    private normalize(
        status: number,
        payload: unknown,
    ): {
        code: string;
        message: string;
        errors: ErrorDetail[];
    } {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const input = payload as Record<string, unknown>;
            if (
                typeof input.code === 'string' &&
                typeof input.message === 'string'
            ) {
                return {
                    code: input.code,
                    message: input.message,
                    errors: Array.isArray(input.errors)
                        ? (input.errors as ErrorDetail[])
                        : [],
                };
            }
            return {
                code: this.defaultCode(status),
                message: this.readMessage(input.message),
                errors: [],
            };
        }

        return {
            code: this.defaultCode(status),
            message:
                status >= 500
                    ? 'Внутренняя ошибка сервера'
                    : this.readMessage(payload),
            errors: [],
        };
    }

    private readMessage(value: unknown) {
        if (Array.isArray(value)) return value.join('; ');
        if (typeof value === 'string' && value.trim()) return value;
        return 'Запрос не может быть выполнен';
    }

    private defaultCode(status: number) {
        if (status === 400) return 'BAD_REQUEST';
        if (status === 401) return 'UNAUTHORIZED';
        if (status === 403) return 'FORBIDDEN';
        if (status === 404) return 'NOT_FOUND';
        if (status === 409) return 'CONFLICT';
        if (status === 413) return 'PAYLOAD_TOO_LARGE';
        if (status === 429) return 'RATE_LIMITED';
        return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    }

    private multipartError(exception: unknown): {
        status: number;
        payload: { code: string; message: string; errors: never[] };
    } | null {
        if (
            !exception ||
            typeof exception !== 'object' ||
            (exception as { name?: unknown }).name !== 'MulterError'
        ) {
            return null;
        }
        const code = (exception as { code?: unknown }).code;
        const tooLarge = code === 'LIMIT_FILE_SIZE';
        return {
            status: tooLarge ? 413 : 400,
            payload: {
                code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_MULTIPART',
                message: tooLarge
                    ? 'Uploaded file exceeds the configured size limit'
                    : 'Multipart request does not match the upload contract',
                errors: [],
            },
        };
    }
}
