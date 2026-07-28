import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { ApplicationLifecycleState } from '../../src/bootstrap/application-lifecycle.state';
import { GracefulShutdownCoordinator } from '../../src/bootstrap/graceful-shutdown';
import {
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from '../../src/bootstrap/http-drain.middleware';
import { configureHttpApplication } from '../../src/bootstrap/http-application';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

jest.setTimeout(20_000);

let queryStarted = deferred<void>();
let queryCompleted = false;

@Controller('prisma-shutdown-fixture')
class PrismaShutdownFixtureController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async query(): Promise<{ completed: true }> {
    queryStarted.resolve();
    await this.prisma.$queryRaw`SELECT 1 AS completed FROM pg_sleep(1)`;
    queryCompleted = true;
    return { completed: true };
  }
}

@Module({
  controllers: [PrismaShutdownFixtureController],
  providers: [
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLifecycleCompletionInterceptor,
    },
  ],
})
class PrismaShutdownFixtureModule {}

describe('Prisma graceful shutdown ordering', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for isolated Prisma lifecycle proof',
      );
    }
    queryStarted = deferred<void>();
    queryCompleted = false;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('finishes an admitted query before one exactly-once disconnect', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaShutdownFixtureModule],
    }).compile();
    app = moduleRef.createNestApplication();
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
    const prisma = app.get(PrismaService);
    const disconnect = jest.spyOn(prisma, '$disconnect');
    await app.listen(0, '127.0.0.1');

    const server = app.getHttpServer();
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/api/v1/prisma-shutdown-fixture`;
    const admittedResponse = fetch(url);
    await queryStarted.promise;

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

    const shutdown = coordinator.handleSignal('SIGTERM');
    expect(disconnect).not.toHaveBeenCalled();
    await expect(fetch(url)).rejects.toThrow();

    const response = await admittedResponse;
    await expect(response.json()).resolves.toEqual({ completed: true });
    await shutdown;

    expect(queryCompleted).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).not.toHaveBeenCalled();
    app = undefined;
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
