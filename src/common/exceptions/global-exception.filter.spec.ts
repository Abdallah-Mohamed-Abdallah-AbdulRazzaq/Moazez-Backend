import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createRequestContext,
  runWithRequestContext,
} from '../context/request-context';
import { ApplicationLifecycleState } from '../../bootstrap/application-lifecycle.state';
import { HttpLifecycleAdmissionGuard } from '../../bootstrap/http-drain.middleware';
import { HttpShutdownAdmissionRejectedError } from '../lifecycle/http-request-lifecycle';
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

  it('releases an admitted HTTP lease when a guard or pre-interceptor path fails', () => {
    const lifecycle = new ApplicationLifecycleState();
    const { host, request, response } = createHost({});
    new HttpLifecycleAdmissionGuard(lifecycle).canActivate(
      executionContext(request),
    );
    expect(lifecycle.getActiveWorkCount()).toBe(1);

    new GlobalExceptionFilter().catch(
      new BadRequestException('guard rejected'),
      host,
    );

    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });

  it('keeps a raced shutdown admission response minimal', () => {
    const { host, response } = createHost({});

    new GlobalExceptionFilter().catch(
      new HttpShutdownAdmissionRejectedError(),
      host,
    );

    expect(response.statusCode).toBe(503);
    expect(response.setHeader).toHaveBeenCalledWith('connection', 'close');
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify({ statusCode: 503, message: 'Service unavailable' }),
    );
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

function createHost(headers: Record<string, string>): {
  host: ArgumentsHost;
  request: Request;
  response: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
    end: jest.Mock;
    statusCode: number;
  };
} {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    end: jest.fn(),
    statusCode: 200,
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
  return { host, request, response };
}

function executionContext(request: Request) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}
