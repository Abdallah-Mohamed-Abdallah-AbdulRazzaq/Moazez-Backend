import { type ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { attachHttpRequestWorkLease } from '../../../../common/lifecycle/http-request-lifecycle';
import { BrandingLogoMultipartExceptionFilter } from '../controller/branding.controller';
import { BRANDING_LOGO_MAX_SIZE_BYTES } from '../domain/branding-logo.constants';
import { BrandingLogoSizeExceededException } from '../domain/branding-logo.errors';

describe('BrandingLogoMultipartExceptionFilter', () => {
  function createHttpHost(): {
    host: ArgumentsHost;
    release: jest.Mock;
    response: {
      status: jest.Mock;
      json: jest.Mock;
    };
  } {
    const request = {};
    const release = jest.fn();
    attachHttpRequestWorkLease(request as never, { release });
    const response = {
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);

    return {
      host: {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as unknown as ArgumentsHost,
      release,
      response,
    };
  }

  it.each([
    { code: 'LIMIT_FILE_SIZE' },
    new PayloadTooLargeException('File too large'),
  ])('settles the lease and preserves the stable 413 envelope', (exception) => {
    const { host, release, response } = createHttpHost();
    const filter = new BrandingLogoMultipartExceptionFilter();

    runWithRequestContext(createRequestContext('branding-request-id'), () =>
      filter.catch(exception, host),
    );

    const authoritativeError = new BrandingLogoSizeExceededException(
      BRANDING_LOGO_MAX_SIZE_BYTES,
    );
    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: authoritativeError.code,
        message: authoritativeError.message,
        details: authoritativeError.details,
        traceId: 'branding-request-id',
      },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('settles the lease before rethrowing an unrecognized exception', () => {
    const { host, release, response } = createHttpHost();
    const filter = new BrandingLogoMultipartExceptionFilter();
    const exception = new Error('unrecognized');

    expect(() => filter.catch(exception, host)).toThrow(exception);
    expect(release).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
