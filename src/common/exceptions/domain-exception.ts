import { HttpStatus } from '@nestjs/common';

export interface DomainExceptionOptions {
  code: string;
  message: string;
  httpStatus?: HttpStatus;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class DomainException extends Error {
  readonly code: string;
  readonly httpStatus: HttpStatus;
  readonly details?: Record<string, unknown>;

  constructor(options: DomainExceptionOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'DomainException';
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? HttpStatus.BAD_REQUEST;
    this.details = options.details;
  }
}

export class NotFoundDomainException extends DomainException {
  constructor(
    message = 'Resource not found',
    details?: Record<string, unknown>,
  ) {
    super({
      code: 'not_found',
      message,
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class ValidationDomainException extends DomainException {
  constructor(message = 'Request validation failed', details?: Record<string, unknown>) {
    super({
      code: 'validation.failed',
      message,
      httpStatus: HttpStatus.BAD_REQUEST,
      details,
    });
  }
}
