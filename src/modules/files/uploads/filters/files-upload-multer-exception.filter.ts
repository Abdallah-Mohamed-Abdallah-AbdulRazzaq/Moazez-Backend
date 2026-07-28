import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExecutionContext,
  ExceptionFilter,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, Observable, throwError } from 'rxjs';
import { getCurrentRequestId } from '../../../../common/context/request-context';
import { releaseHttpRequestWorkLease } from '../../../../common/lifecycle/http-request-lifecycle';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../domain/file-upload.constraints';
import { FilesUploadSizeExceededException } from '../domain/file-upload.exceptions';

@Injectable()
export class FilesUploadMulterCodeRestorationInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((exception: unknown) => {
        if (isNestTransformedMulterFileSizeError(exception)) {
          Object.assign(exception, { code: 'LIMIT_FILE_SIZE' });
        }
        return throwError(() => exception);
      }),
    );
  }
}

@Catch()
export class FilesUploadMulterExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    releaseHttpRequestWorkLease(request);

    if (!isMulterFileSizeError(exception)) {
      throw exception;
    }

    const response = http.getResponse<Response>();
    const error = new FilesUploadSizeExceededException({
      maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES,
    });

    response.status(error.httpStatus).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        traceId: getCurrentRequestId(),
      },
    });
  }
}

function isMulterFileSizeError(exception: unknown): boolean {
  return Boolean(
    exception &&
    typeof exception === 'object' &&
    'code' in exception &&
    (exception as { code?: unknown }).code === 'LIMIT_FILE_SIZE',
  );
}

function isNestTransformedMulterFileSizeError(
  exception: unknown,
): exception is PayloadTooLargeException {
  return (
    exception instanceof PayloadTooLargeException &&
    exception.message === 'File too large'
  );
}
