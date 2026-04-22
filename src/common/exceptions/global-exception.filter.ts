import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { DomainException } from './domain-exception';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = this.resolveTraceId(request);

    const { status, envelope } = this.toEnvelope(exception, traceId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} → ${status} ${envelope.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(envelope);
  }

  private toEnvelope(
    exception: unknown,
    traceId: string,
  ): { status: HttpStatus; envelope: ErrorEnvelope } {
    if (exception instanceof DomainException) {
      return {
        status: exception.httpStatus,
        envelope: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
            traceId,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const { code, message, details } = this.unpackHttpException(
        status,
        response,
      );
      return {
        status,
        envelope: {
          error: {
            code,
            message,
            details,
            traceId,
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred',
          traceId,
        },
      },
    };
  }

  private unpackHttpException(
    status: HttpStatus,
    payload: string | object,
  ): { code: string; message: string; details?: Record<string, unknown> } {
    const fallback = this.defaultCodeForStatus(status);

    if (typeof payload === 'string') {
      return { code: fallback.code, message: payload || fallback.message };
    }

    const asRecord = payload as Record<string, unknown>;
    const message =
      (typeof asRecord.message === 'string' && asRecord.message) ||
      (Array.isArray(asRecord.message) && asRecord.message.join('; ')) ||
      fallback.message;

    const details =
      Array.isArray(asRecord.message) && asRecord.message.length > 0
        ? { fields: asRecord.message }
        : undefined;

    return { code: fallback.code, message: String(message), details };
  }

  private defaultCodeForStatus(status: HttpStatus): {
    code: string;
    message: string;
  } {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return { code: 'validation.failed', message: 'Request validation failed' };
      case HttpStatus.UNAUTHORIZED:
        return { code: 'auth.token.invalid', message: 'Unauthorized' };
      case HttpStatus.FORBIDDEN:
        return { code: 'auth.scope.missing', message: 'Forbidden' };
      case HttpStatus.NOT_FOUND:
        return { code: 'not_found', message: 'Resource not found' };
      case HttpStatus.CONFLICT:
        return { code: 'conflict', message: 'Conflict' };
      case HttpStatus.TOO_MANY_REQUESTS:
        return { code: 'rate_limit.exceeded', message: 'Too many requests' };
      default:
        return { code: 'internal_error', message: 'An unexpected error occurred' };
    }
  }

  private resolveTraceId(request: Request): string {
    const headerTraceId = request.header('x-trace-id');
    return headerTraceId && headerTraceId.length > 0
      ? headerTraceId
      : randomUUID();
  }
}
