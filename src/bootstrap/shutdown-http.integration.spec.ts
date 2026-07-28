import {
  BadRequestException,
  type CanActivate,
  Controller,
  Get,
  Injectable,
  type INestApplication,
  Module,
  type OnModuleDestroy,
  UseGuards,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  Agent,
  get as httpGet,
  request as httpRequest,
  type IncomingHttpHeaders,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { ApplicationLifecycleState } from './application-lifecycle.state';
import { GlobalExceptionFilter } from '../common/exceptions/global-exception.filter';
import {
  GracefulShutdownCoordinator,
  LIFECYCLE_EVENTS,
} from './graceful-shutdown';
import {
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from './http-drain.middleware';
import { configureHttpApplication } from './http-application';

jest.setTimeout(30_000);

@Injectable()
class LifecycleProbe implements OnModuleDestroy {
  readonly destroyed = jest.fn();

  onModuleDestroy(): void {
    this.destroyed();
  }
}

@Injectable()
class PrismaDisconnectProbe implements OnModuleDestroy {
  readonly disconnect = jest.fn().mockResolvedValue(undefined);

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }
}

@Injectable()
class RejectingFixtureGuard implements CanActivate {
  canActivate(): never {
    throw new BadRequestException('fixture guard rejection');
  }
}

@Controller('shutdown-fixture')
class ShutdownFixtureController {
  @Get('slow')
  slow(): Promise<{ completed: true }> {
    requestStarted.resolve();
    return requestCompletion.promise;
  }

  @Get('never')
  never(): Promise<{ completed: true }> {
    neverRequestStarted.resolve();
    return neverRequestCompletion.promise;
  }

  @Get('fast')
  fast(): { completed: true } {
    fastHandlerInvocations += 1;
    return { completed: true };
  }

  @Get('guard-failure')
  @UseGuards(RejectingFixtureGuard)
  guardFailure(): never {
    throw new Error('guard should have rejected before the controller');
  }
}

@Module({
  controllers: [ShutdownFixtureController],
  providers: [
    LifecycleProbe,
    PrismaDisconnectProbe,
    RejectingFixtureGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLifecycleCompletionInterceptor,
    },
  ],
})
class ShutdownFixtureModule {}

let requestStarted = deferred<void>();
let requestCompletion = deferred<{ completed: true }>();
let neverRequestStarted = deferred<void>();
let neverRequestCompletion = deferred<{ completed: true }>();
let fastHandlerInvocations = 0;

describe('HTTP graceful shutdown integration', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    requestStarted = deferred<void>();
    requestCompletion = deferred<{ completed: true }>();
    neverRequestStarted = deferred<void>();
    neverRequestCompletion = deferred<{ completed: true }>();
    fastHandlerInvocations = 0;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('stops listening, drains admitted work, then executes Nest cleanup', async () => {
    const fixture = await createFixture();
    app = fixture.app;
    const admittedResponse = fetch(fixture.url('slow'));
    await requestStarted.promise;

    const shutdown = fixture.coordinator.handleSignal('SIGTERM');
    expect(fixture.server.listening).toBe(false);
    expect(fixture.lifecycleProbe.destroyed).not.toHaveBeenCalled();

    await expect(fetch(fixture.url('slow'))).rejects.toThrow();
    expect(fixture.lifecycleProbe.destroyed).not.toHaveBeenCalled();

    requestCompletion.resolve({ completed: true });
    const response = await admittedResponse;
    await expect(response.json()).resolves.toEqual({ completed: true });
    await shutdown;

    expect(fixture.lifecycleProbe.destroyed).toHaveBeenCalledTimes(1);
    expect(fixture.prismaProbe.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.processTarget.exit).not.toHaveBeenCalled();
    expect(fixture.processTarget.exitCode).toBe(0);
    app = undefined;
  });

  it('keeps client-aborted handler work admitted until the Nest pipeline settles', async () => {
    const fixture = await createFixture();
    app = fixture.app;
    const clientRequest = startAbortableRequest(fixture.url('slow'));
    await requestStarted.promise;

    const transportClosed = closeClientRequest(clientRequest);
    await transportClosed;
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(1);

    const closeSpy = jest.spyOn(fixture.app, 'close');
    const shutdown = fixture.coordinator.handleSignal('SIGTERM');
    await nextTurn();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(fixture.prismaProbe.disconnect).not.toHaveBeenCalled();
    expect(fixture.lifecycleProbe.destroyed).not.toHaveBeenCalled();

    requestCompletion.resolve({ completed: true });
    await shutdown;

    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(fixture.prismaProbe.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycleProbe.destroyed).toHaveBeenCalledTimes(1);
    expect(fixture.processTarget.exitCode).toBe(0);
    app = undefined;
  });

  it('times out when client-aborted handler work never settles', async () => {
    const fixture = await createFixture(1_000);
    app = fixture.app;
    const clientRequest = startAbortableRequest(fixture.url('never'));
    await neverRequestStarted.promise;
    await closeClientRequest(clientRequest);

    const closeSpy = jest.spyOn(fixture.app, 'close');
    const shutdown = fixture.coordinator.handleSignal('SIGTERM');
    await shutdown;

    expect(fixture.lifecycle.getActiveWorkCount()).toBe(1);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(fixture.prismaProbe.disconnect).not.toHaveBeenCalled();
    expect(fixture.lifecycleProbe.destroyed).not.toHaveBeenCalled();
    expect(fixture.processTarget.exit).toHaveBeenCalledWith(1);
    expect(fixture.events()).toContain(LIFECYCLE_EVENTS.timedOut);
    expect(fixture.events()).not.toContain(LIFECYCLE_EVENTS.completed);

    neverRequestCompletion.resolve({ completed: true });
    await fixture.lifecycle.waitForIdle();
    await eventually(() => expect(closeSpy).toHaveBeenCalledTimes(1));
    expect(fixture.prismaProbe.disconnect).toHaveBeenCalledTimes(1);
    app = undefined;
  });

  it('rejects new work on the same keep-alive socket after draining starts', async () => {
    const fixture = await createFixture();
    app = fixture.app;
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });

    try {
      const admitted = await performRequest(fixture.url('fast'), { agent });
      expect(admitted.statusCode).toBe(200);
      expect(fastHandlerInvocations).toBe(1);

      fixture.lifecycle.beginDraining();
      const rejected = await performRequest(fixture.url('fast'), {
        agent,
        headers: { 'x-request-id': 'keep-alive-rejected' },
      });

      expect(rejected.socket).toBe(admitted.socket);
      expect(rejected.statusCode).toBe(503);
      expect(rejected.body).toBe(
        JSON.stringify({
          statusCode: 503,
          message: 'Service unavailable',
        }),
      );
      expect(fastHandlerInvocations).toBe(1);

      await fixture.coordinator.handleSignal('SIGTERM');
      expect(fixture.processTarget.exitCode).toBe(0);
      app = undefined;
    } finally {
      agent.destroy();
    }
  });

  it('preserves shared CORS policy and request ID on shutdown responses', async () => {
    const fixture = await createFixture();
    app = fixture.app;
    fixture.lifecycle.beginDraining();

    const allowed = await performRequest(fixture.url('fast'), {
      headers: {
        origin: 'http://localhost:3001',
        'x-request-id': 'allowed-shutdown-request',
      },
    });
    expect(allowed.statusCode).toBe(503);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['x-request-id']).toBe('allowed-shutdown-request');
    expect(allowed.body).toBe(
      JSON.stringify({
        statusCode: 503,
        message: 'Service unavailable',
      }),
    );

    const disallowed = await performRequest(fixture.url('fast'), {
      headers: {
        origin: 'http://unapproved.example',
        'x-request-id': 'disallowed-shutdown-request',
      },
    });
    expect(disallowed.statusCode).toBe(503);
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
    expect(disallowed.headers['x-request-id']).toBe(
      'disallowed-shutdown-request',
    );
    expect(fastHandlerInvocations).toBe(0);
  });

  it('does not lease raw Swagger routes and rejects them after drain begins', async () => {
    const fixture = await createFixture(5_000, true);
    app = fixture.app;

    const swaggerUi = await fetch(fixture.absoluteUrl('/api/v1/docs'), {
      redirect: 'follow',
    });
    expect(swaggerUi.status).toBe(200);
    expect(await swaggerUi.text()).toContain('Swagger UI');
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);

    const swaggerJson = await fetch(fixture.absoluteUrl('/api/v1/docs-json'));
    expect(swaggerJson.status).toBe(200);
    expect((await swaggerJson.json()) as object).toHaveProperty('openapi');
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);

    const swaggerAsset = await fetch(
      fixture.absoluteUrl('/api/v1/docs/swagger-ui.css'),
    );
    expect(swaggerAsset.status).toBe(200);
    expect(await swaggerAsset.text()).toContain('.swagger-ui');
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);

    await fetch(fixture.url('fast'));
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    await fetch(fixture.url('guard-failure'));
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    await fetch(fixture.absoluteUrl('/api/v1/missing-route'));
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);

    fixture.lifecycle.beginDraining();
    const rejected = await fetch(fixture.absoluteUrl('/api/v1/docs'), {
      redirect: 'manual',
    });
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toEqual({
      statusCode: 503,
      message: 'Service unavailable',
    });
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);

    await fixture.coordinator.handleSignal('SIGTERM');
    expect(fixture.processTarget.exitCode).toBe(0);
    app = undefined;
  });
});

async function createFixture(
  timeoutMs = 5_000,
  swaggerEnabled = false,
): Promise<{
  app: INestApplication;
  coordinator: GracefulShutdownCoordinator;
  events(): string[];
  lifecycle: ApplicationLifecycleState;
  lifecycleProbe: LifecycleProbe;
  prismaProbe: PrismaDisconnectProbe;
  processTarget: {
    exitCode: string | number | null | undefined;
    on: jest.Mock;
    off: jest.Mock;
    exit: jest.Mock;
  };
  server: ReturnType<INestApplication['getHttpServer']>;
  absoluteUrl(path: string): string;
  url(path: string): string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [ShutdownFixtureModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  const lifecycle = new ApplicationLifecycleState();
  configureHttpApplication(
    app,
    {
      environment: 'test',
      corsOrigins: 'http://localhost:3001',
      swaggerEnabled,
    },
    lifecycle,
  );
  app.useGlobalGuards(new HttpLifecycleAdmissionGuard(lifecycle));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(0, '127.0.0.1');

  const server = app.getHttpServer();
  const address = server.address() as AddressInfo;
  const logger = { log: jest.fn(), error: jest.fn() };
  const processTarget = {
    exitCode: undefined as string | number | null | undefined,
    on: jest.fn(),
    off: jest.fn(),
    exit: jest.fn(),
  };
  const coordinator = new GracefulShutdownCoordinator({
    app,
    httpServer: server,
    lifecycle,
    queue: { beginWorkerDrain: jest.fn().mockResolvedValue(undefined) },
    realtime: {
      disconnectSocketsForShutdown: jest.fn().mockResolvedValue(undefined),
    },
    timeoutMs,
    logger,
    processTarget,
  });

  return {
    app,
    coordinator,
    events: () =>
      [...logger.log.mock.calls, ...logger.error.mock.calls].map(
        ([entry]) => entry.event as string,
      ),
    lifecycle,
    lifecycleProbe: app.get(LifecycleProbe),
    prismaProbe: app.get(PrismaDisconnectProbe),
    processTarget,
    server,
    absoluteUrl: (path) => `http://127.0.0.1:${address.port}${path}`,
    url: (path) =>
      `http://127.0.0.1:${address.port}/api/v1/shutdown-fixture/${path}`,
  };
}

function startAbortableRequest(url: string): ReturnType<typeof httpGet> {
  const clientRequest = httpGet(url);
  clientRequest.on('error', () => undefined);
  return clientRequest;
}

function closeClientRequest(
  clientRequest: ReturnType<typeof httpGet>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    clientRequest.once('close', resolve);
    clientRequest.destroy();
  });
}

function performRequest(
  url: string,
  options: {
    agent?: Agent;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  body: string;
  headers: IncomingHttpHeaders;
  socket: Socket;
  statusCode: number | undefined;
}> {
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined;
    const request = httpRequest(
      url,
      {
        agent: options.agent,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          if (!socket) {
            reject(new Error('HTTP request did not receive a socket'));
            return;
          }
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
            socket,
            statusCode: response.statusCode,
          });
        });
      },
    );
    request.once('socket', (assignedSocket) => {
      socket = assignedSocket;
    });
    request.once('error', reject);
    request.end();
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await nextTurn();
    }
  }
  assertion();
}
