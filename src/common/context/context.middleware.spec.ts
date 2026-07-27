import type { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware } from './context.middleware';
import { REQUEST_ID_HEADER } from './correlation-id';
import { getRequestContext } from './request-context';

describe('RequestContextMiddleware', () => {
  it('returns the same canonical request ID in the response and request context', () => {
    const middleware = new RequestContextMiddleware();
    const request = {
      headers: { [REQUEST_ID_HEADER]: 'caller-request-1' },
    } as unknown as Request;
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn(() => {
      expect(getRequestContext()?.requestId).toBe('caller-request-1');
    }) as unknown as NextFunction;

    middleware.use(request, response, next);

    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'caller-request-1',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('never reflects an invalid inbound request ID', () => {
    const middleware = new RequestContextMiddleware();
    const request = {
      headers: { [REQUEST_ID_HEADER]: 'untrusted\r\nvalue' },
    } as unknown as Request;
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(request, response, next);

    const finalId = (response.setHeader as jest.Mock).mock
      .calls[0][1] as string;
    expect(finalId).not.toContain('untrusted');
    expect(finalId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });
});
