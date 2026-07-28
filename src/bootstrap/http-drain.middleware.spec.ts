import { EventEmitter } from 'node:events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { REQUEST_ID_HEADER } from '../common/context/correlation-id';
import { releaseHttpRequestWorkLease } from '../common/lifecycle/http-request-lifecycle';
import { ApplicationLifecycleState } from './application-lifecycle.state';
import {
  createHttpDrainMiddleware,
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from './http-drain.middleware';

describe('HTTP shutdown admission middleware', () => {
  it('does not own controller work or release it when the transport closes', async () => {
    const lifecycle = new ApplicationLifecycleState();
    const middleware = createHttpDrainMiddleware(lifecycle);
    const request = requestDouble('admitted-request');
    const response = responseDouble();
    const next = jest.fn() as unknown as NextFunction;

    middleware(request, response as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(lifecycle.getActiveWorkCount()).toBe(0);
    expect(
      new HttpLifecycleAdmissionGuard(lifecycle).canActivate(
        executionContext(request),
      ),
    ).toBe(true);
    expect(lifecycle.getActiveWorkCount()).toBe(1);

    lifecycle.beginDraining();
    response.emit('close');
    response.emit('finish');
    await Promise.resolve();
    expect(lifecycle.getActiveWorkCount()).toBe(1);

    releaseHttpRequestWorkLease(request);
    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });

  it('rejects a controller admission race after the drain barrier passed', () => {
    const lifecycle = new ApplicationLifecycleState();
    const request = requestDouble('admission-race');
    const next = jest.fn();
    createHttpDrainMiddleware(lifecycle)(
      request,
      responseDouble() as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);

    lifecycle.beginDraining();
    expect(() =>
      new HttpLifecycleAdmissionGuard(lifecycle).canActivate(
        executionContext(request),
      ),
    ).toThrow('http_shutdown_admission_rejected');
    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });

  it('rejects new work with a minimal 503 and canonical request ID', () => {
    const lifecycle = new ApplicationLifecycleState();
    lifecycle.beginDraining();
    const middleware = createHttpDrainMiddleware(lifecycle);
    const response = responseDouble();
    const next = jest.fn() as unknown as NextFunction;

    middleware(
      requestDouble('shutdown-request'),
      response as unknown as Response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(503);
    expect(response.headers).toMatchObject({
      [REQUEST_ID_HEADER]: 'shutdown-request',
      connection: 'close',
      'content-type': 'application/json; charset=utf-8',
    });
    expect(response.body).toBe(
      JSON.stringify({ statusCode: 503, message: 'Service unavailable' }),
    );
  });

  it('releases successful Nest pipeline work exactly once', async () => {
    const { lifecycle, request, context } = admittedRequestHarness();
    const interceptor = new HttpLifecycleCompletionInterceptor();

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => of({ completed: true }),
        } as CallHandler),
      ),
    ).resolves.toEqual({ completed: true });

    expect(lifecycle.getActiveWorkCount()).toBe(0);
    releaseHttpRequestWorkLease(request);
    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });

  it('releases failed Nest pipeline work exactly once', async () => {
    const { lifecycle, request, context } = admittedRequestHarness();
    const interceptor = new HttpLifecycleCompletionInterceptor();
    const failure = new Error('fixture failure');

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => failure),
        } as CallHandler),
      ),
    ).rejects.toBe(failure);

    expect(lifecycle.getActiveWorkCount()).toBe(0);
    releaseHttpRequestWorkLease(request);
    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });

  it('releases work when the Nest call handler fails synchronously', () => {
    const { lifecycle, context } = admittedRequestHarness();
    const interceptor = new HttpLifecycleCompletionInterceptor();
    const failure = new Error('synchronous fixture failure');

    expect(() =>
      interceptor.intercept(context, {
        handle: () => {
          throw failure;
        },
      } as CallHandler),
    ).toThrow(failure);
    expect(lifecycle.getActiveWorkCount()).toBe(0);
  });
});

function admittedRequestHarness(): {
  lifecycle: ApplicationLifecycleState;
  request: Request;
  context: ExecutionContext;
} {
  const lifecycle = new ApplicationLifecycleState();
  const middleware = createHttpDrainMiddleware(lifecycle);
  const request = requestDouble('pipeline-request');
  middleware(
    request,
    responseDouble() as unknown as Response,
    jest.fn() as unknown as NextFunction,
  );
  const context = executionContext(request);
  new HttpLifecycleAdmissionGuard(lifecycle).canActivate(context);

  return {
    lifecycle,
    request,
    context,
  };
}

function executionContext(request: Request): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function requestDouble(requestId: string): Request {
  return {
    headers: { [REQUEST_ID_HEADER]: requestId },
  } as unknown as Request;
}

function responseDouble(): EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
  setHeader(name: string, value: string): void;
  end(body: string): void;
} {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    body?: string;
    setHeader(name: string, value: string): void;
    end(body: string): void;
  };
  response.statusCode = 200;
  response.headers = {};
  response.setHeader = (name, value) => {
    response.headers[name] = value;
  };
  response.end = (body) => {
    response.body = body;
    response.emit('finish');
  };
  return response;
}
