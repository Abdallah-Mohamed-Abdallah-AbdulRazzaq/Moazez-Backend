import {
  Injectable,
  type INestApplication,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  get as httpGet,
  type ClientRequest,
  type IncomingMessage,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough, type Readable } from 'node:stream';
import { ApplicationLifecycleState } from '../../../../bootstrap/application-lifecycle.state';
import { GracefulShutdownCoordinator } from '../../../../bootstrap/graceful-shutdown';
import {
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from '../../../../bootstrap/http-drain.middleware';
import { configureHttpApplication } from '../../../../bootstrap/http-application';
import { GetPublicSchoolBrandingLogoUseCase } from '../application/get-public-school-branding-logo.use-case';
import { PublicSchoolBrandingController } from '../controller/public-school-branding.controller';
import { BRANDING_LOGO_CACHE_CONTROL } from '../domain/branding-logo.constants';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

@Injectable()
class BrandingLifecycleProbe implements OnModuleDestroy {
  readonly destroyed = jest.fn();

  onModuleDestroy(): void {
    this.destroyed();
  }
}

@Module({
  controllers: [PublicSchoolBrandingController],
  providers: [
    BrandingLifecycleProbe,
    {
      provide: GetPublicSchoolBrandingLogoUseCase,
      useValue: {
        execute: (schoolId: string) => currentDelivery.execute(schoolId),
      },
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLifecycleCompletionInterceptor,
    },
  ],
})
class BrandingLifecycleFixtureModule {}

let currentDelivery = deliveryDouble(new PassThrough(), 11);

describe('public branding stream shutdown lifecycle', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    currentDelivery = deliveryDouble(new PassThrough(), 11);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('keeps the request admitted until a slow stream and response finish', async () => {
    const source = new PassThrough();
    currentDelivery = deliveryDouble(source, 11);
    const fixture = await createFixture();
    app = fixture.app;
    const request = startStreamingRequest(fixture.url);

    await within(currentDelivery.started.promise, 'delivery start');
    source.write(Buffer.from('image-'));
    const response = await within(request.response, 'response start');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-length']).toBe('11');
    expect(response.headers['cache-control']).toBe(BRANDING_LOGO_CACHE_CONTROL);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(1);
    const clientSocket = response.socket;

    const appClose = jest.spyOn(fixture.app, 'close');
    const shutdown = fixture.coordinator.handleSignal('SIGTERM');
    await nextTurn();
    expect(appClose).not.toHaveBeenCalled();
    expect(fixture.probe.destroyed).not.toHaveBeenCalled();

    source.end(Buffer.from('bytes'));
    await expect(within(request.completed, 'response completion')).resolves.toEqual(
      Buffer.from('image-bytes'),
    );
    response.destroy();
    clientSocket.destroy();
    request.client.destroy();
    await within(shutdown, 'graceful shutdown');

    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    expect(appClose).toHaveBeenCalledTimes(1);
    expect(fixture.probe.destroyed).toHaveBeenCalledTimes(1);
    expect(fixture.processTarget.exitCode).toBe(0);
    app = undefined;
  });

  it('destroys the source and releases lifecycle work after client abort', async () => {
    const source = new PassThrough();
    currentDelivery = deliveryDouble(source, 11);
    const fixture = await createFixture();
    app = fixture.app;
    const request = startStreamingRequest(fixture.url);
    void request.completed.catch(() => undefined);

    await currentDelivery.started.promise;
    source.write(Buffer.from('image-'));
    const response = await request.response;
    const sourceClosed = eventPromise(source, 'close');
    const responseClosed = eventPromise(response, 'close');
    response.destroy();
    request.client.destroy();

    await responseClosed;
    await sourceClosed;
    await eventually(() =>
      expect(fixture.lifecycle.getActiveWorkCount()).toBe(0),
    );
    expect(source.destroyed).toBe(true);

    await fixture.coordinator.handleSignal('SIGTERM');
    expect(fixture.probe.destroyed).toHaveBeenCalledTimes(1);
    expect(fixture.processTarget.exitCode).toBe(0);
    app = undefined;
  });

  it('keeps stream failures redacted and never writes a JSON envelope', async () => {
    const secret =
      's3://access-key:secret-key@storage.internal/private/object-key';
    const source = new PassThrough();
    currentDelivery = deliveryDouble(source, 11);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const fixture = await createFixture();
    app = fixture.app;
    const request = startStreamingRequest(fixture.url);
    void request.completed.catch(() => undefined);

    try {
      await currentDelivery.started.promise;
      source.write(Buffer.from('image-'));
      const response = await request.response;
      const responseClosed = eventPromise(response, 'close');
      source.destroy(new Error(secret));
      await responseClosed;
      request.client.destroy();
      await eventually(() =>
        expect(fixture.lifecycle.getActiveWorkCount()).toBe(0),
      );

      expect(logger).toHaveBeenCalledWith({
        event: 'branding.logo.public.stream_failed',
      });
      expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
      expect(response.complete).toBe(false);
    } finally {
      logger.mockRestore();
    }

    await fixture.coordinator.handleSignal('SIGTERM');
    app = undefined;
  });
});

async function createFixture(): Promise<{
  app: INestApplication;
  coordinator: GracefulShutdownCoordinator;
  lifecycle: ApplicationLifecycleState;
  probe: BrandingLifecycleProbe;
  processTarget: {
    exitCode: string | number | null | undefined;
    on: jest.Mock;
    off: jest.Mock;
    exit: jest.Mock;
  };
  url: string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [BrandingLifecycleFixtureModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  const lifecycle = new ApplicationLifecycleState();
  configureHttpApplication(
    app,
    {
      environment: 'test',
      corsOrigins: 'http://localhost:3001',
      swaggerEnabled: false,
    },
    lifecycle,
  );
  app.useGlobalGuards(new HttpLifecycleAdmissionGuard(lifecycle));
  await app.listen(0, '127.0.0.1');

  const server = app.getHttpServer();
  const address = server.address() as AddressInfo;
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
    timeoutMs: 5_000,
    logger: { log: jest.fn(), error: jest.fn() },
    processTarget,
  });

  return {
    app,
    coordinator,
    lifecycle,
    probe: app.get(BrandingLifecycleProbe),
    processTarget,
    url: `http://127.0.0.1:${address.port}/api/v1/public/schools/${SCHOOL_ID}/branding/logo`,
  };
}

function deliveryDouble(
  stream: Readable,
  sizeBytes: number,
): {
  execute: jest.Mock;
  started: ReturnType<typeof deferred<void>>;
} {
  const started = deferred<void>();
  return {
    execute: jest.fn(async () => {
      started.resolve();
      return {
        stream,
        mimeType: 'image/png',
        sizeBytes,
      };
    }),
    started,
  };
}

function startStreamingRequest(url: string): {
  client: ClientRequest;
  completed: Promise<Buffer>;
  response: Promise<IncomingMessage>;
} {
  const response = deferred<IncomingMessage>();
  const completed = deferred<Buffer>();
  const client = httpGet(url, (incoming) => {
    response.resolve(incoming);
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.once('end', () => completed.resolve(Buffer.concat(chunks)));
    incoming.once('error', completed.reject);
    incoming.once('aborted', () =>
      completed.reject(new Error('response_aborted')),
    );
  });
  client.once('error', completed.reject);
  return { client, completed: completed.promise, response: response.promise };
}

function eventPromise(
  emitter: NodeJS.EventEmitter,
  event: string,
): Promise<void> {
  return new Promise<void>((resolve) => emitter.once(event, resolve));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await nextTurn();
    }
  }
  assertion();
}

async function within<T>(promise: Promise<T>, stage: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`fixture_timeout:${stage}`)),
          2_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
