import {
  ArgumentsHost,
  CallHandler,
  ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { FilesUploadSizeExceededException } from '../domain/file-upload.exceptions';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../domain/file-upload.constraints';
import {
  FilesUploadMulterCodeRestorationInterceptor,
  FilesUploadMulterExceptionFilter,
} from '../filters/files-upload-multer-exception.filter';

describe('FilesUploadMulterCodeRestorationInterceptor', () => {
  const context = {} as ExecutionContext;

  function executeWithError(exception: unknown): Promise<unknown> {
    const next: CallHandler = {
      handle: () => throwError(() => exception),
    };
    const interceptor = new FilesUploadMulterCodeRestorationInterceptor();

    return lastValueFrom(interceptor.intercept(context, next));
  }

  it('marks only the exact Nest-transformed Multer file-size error', async () => {
    const exception = new PayloadTooLargeException(
      'File too large',
    ) as PayloadTooLargeException & { code?: string };

    await expect(executeWithError(exception)).rejects.toBe(exception);
    expect(exception.code).toBe('LIMIT_FILE_SIZE');
  });

  it('does not classify an unrelated payload-too-large exception', async () => {
    const exception = new PayloadTooLargeException(
      'Different payload-too-large condition',
    ) as PayloadTooLargeException & { code?: string };

    await expect(executeWithError(exception)).rejects.toBe(exception);
    expect(exception.code).toBeUndefined();
  });

  it('preserves the domain size exception and its stable code', async () => {
    const exception = new FilesUploadSizeExceededException({
      maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES,
    });

    await expect(executeWithError(exception)).rejects.toBe(exception);
    expect(exception.code).toBe('files.upload.size_exceeded');
    expect(exception.code).not.toBe('LIMIT_FILE_SIZE');
  });

  it('rethrows an unrelated error unchanged', async () => {
    const exception = new Error('unrelated');

    await expect(executeWithError(exception)).rejects.toBe(exception);
    expect('code' in exception).toBe(false);
  });
});

describe('FilesUploadMulterExceptionFilter', () => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function createHttpHost(headers: Record<string, string> = {}): {
    host: ArgumentsHost;
    response: {
      status: jest.Mock<unknown, [number]>;
      json: jest.Mock<void, [unknown]>;
    };
  } {
    const response = {
      status: jest.fn<unknown, [number]>(),
      json: jest.fn<void, [unknown]>(),
    };
    response.status.mockReturnValue(response);
    const request = {
      header: jest.fn((name: string) => headers[name.toLowerCase()]),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  }

  it('maps only LIMIT_FILE_SIZE to the stable 413 envelope', () => {
    const { host, response } = createHttpHost();
    const filter = new FilesUploadMulterExceptionFilter();

    runWithRequestContext(createRequestContext('stable-request-id'), () =>
      filter.catch(
        {
          code: 'LIMIT_FILE_SIZE',
          field: 'file',
          storageErrors: ['must-not-leak'],
        },
        host,
      ),
    );

    const authoritativeError = new FilesUploadSizeExceededException({
      maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES,
    });
    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: authoritativeError.code,
        message: authoritativeError.message,
        details: { maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES },
        traceId: 'stable-request-id',
      },
    });
  });

  it('rethrows an unrelated exception unchanged', () => {
    const { host, response } = createHttpHost();
    const filter = new FilesUploadMulterExceptionFilter();
    const unrelated = Object.assign(new Error('unrelated'), {
      code: 'LIMIT_UNEXPECTED_FILE',
    });

    expect(() => filter.catch(unrelated, host)).toThrow(unrelated);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it('generates a non-empty UUID when request context is absent', () => {
    const { host, response } = createHttpHost();
    const filter = new FilesUploadMulterExceptionFilter();

    filter.catch({ code: 'LIMIT_FILE_SIZE' }, host);

    const envelope = response.json.mock.calls[0][0] as {
      error: { traceId: string };
    };
    expect(envelope.error.traceId).toMatch(uuidPattern);
  });

  it('ignores x-trace-id and uses the canonical request context', () => {
    const { host, response } = createHttpHost({
      'x-trace-id': 'caller-trace-id',
    });
    const filter = new FilesUploadMulterExceptionFilter();

    runWithRequestContext(createRequestContext('canonical-request-id'), () =>
      filter.catch({ code: 'LIMIT_FILE_SIZE' }, host),
    );

    const envelope = response.json.mock.calls[0][0] as {
      error: { traceId: string };
    };
    expect(envelope.error.traceId).toBe('canonical-request-id');
  });
});
