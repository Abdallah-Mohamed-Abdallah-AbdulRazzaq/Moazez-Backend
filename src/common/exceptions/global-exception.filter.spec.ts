import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createRequestContext,
  runWithRequestContext,
} from '../context/request-context';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter correlation contract', () => {
  it('uses the canonical request-context ID in the error envelope', () => {
    const { host, response } = createHost({
      'x-trace-id': 'untrusted-second-authority',
    });

    runWithRequestContext(createRequestContext('canonical-request-id'), () =>
      new GlobalExceptionFilter().catch(
        new BadRequestException('invalid'),
        host,
      ),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          traceId: 'canonical-request-id',
        }),
      }),
    );
  });

  it('generates a bounded UUID when no request context exists', () => {
    const { host, response } = createHost({});

    new GlobalExceptionFilter().catch(new BadRequestException('invalid'), host);

    const payload = response.json.mock.calls[0][0] as {
      error: { traceId: string };
    };
    expect(payload.error.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });
});

function createHost(headers: Record<string, string>): {
  host: ArgumentsHost;
  response: {
    status: jest.Mock;
    json: jest.Mock;
  };
} {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  const request = {
    method: 'GET',
    url: '/api/v1/test',
    headers,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response as unknown as Response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}
