import { ConfigService } from '@nestjs/config';
import { createServer, type Server as HttpServer } from 'node:http';
import {
  createConnection,
  createServer as createNetServer,
  type Server as NetServer,
  type Socket as NetSocket,
} from 'node:net';
import { Server } from 'socket.io';
import { ApplicationLifecycleState } from '../../src/bootstrap/application-lifecycle.state';
import type { Env } from '../../src/config/env.validation';
import type { RealtimeAuthService } from '../../src/infrastructure/realtime/realtime-auth.service';
import type { RealtimeCommunicationAccessService } from '../../src/infrastructure/realtime/realtime-communication-access.service';
import {
  RealtimeGateway,
  REALTIME_NAMESPACE,
} from '../../src/infrastructure/realtime/realtime.gateway';
import type { RealtimePresenceService } from '../../src/infrastructure/realtime/realtime-presence.service';
import type { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import type { RealtimeTypingService } from '../../src/infrastructure/realtime/realtime-typing.service';

jest.setTimeout(30_000);

describe('Realtime Redis adapter half-open readiness', () => {
  const redisUrl = process.env.TEST_REALTIME_REDIS_URL;

  (redisUrl ? it : it.skip)(
    'retires half-open clients below the probe deadline and recovers on the same gateway',
    async () => {
      const target = new URL(redisUrl as string);
      const proxy = new RedisHalfOpenProxy(
        target.hostname,
        Number(target.port || '6379'),
      );
      const proxyPort = await proxy.listen();
      const gateway = createGateway(
        `redis://127.0.0.1:${proxyPort}`,
      );
      const httpServer = createServer();
      const socketServer = new Server(httpServer, { serveClient: false });
      const namespace = socketServer.of(REALTIME_NAMESPACE);

      try {
        await listen(httpServer);
        await gateway.afterInit(namespace);
        await expect(gateway.checkReadiness()).resolves.toBeUndefined();

        proxy.suspendTraffic();
        const startedAt = Date.now();
        await expect(gateway.checkReadiness()).rejects.toThrow(
          'realtime_redis_unavailable',
        );
        const outageElapsedMs = Date.now() - startedAt;
        expect(outageElapsedMs).toBeGreaterThanOrEqual(300);
        expect(outageElapsedMs).toBeLessThan(750);

        proxy.resumeTraffic();
        await waitForReadiness(gateway);
        await expect(gateway.checkReadiness()).resolves.toBeUndefined();
      } finally {
        await gateway.onModuleDestroy();
        await closeSocketServer(socketServer);
        await closeHttpServer(httpServer);
        await proxy.stop();
      }

      expect(proxy.openSocketCount()).toBe(0);
    },
  );
});

function createGateway(redisUrl: string): RealtimeGateway {
  return new RealtimeGateway(
    {} as RealtimeAuthService,
    {} as RealtimeCommunicationAccessService,
    { bindServer: jest.fn() } as unknown as RealtimePublisherService,
    new ConfigService<Env, true>({ REALTIME_REDIS_URL: redisUrl }),
    {
      registerSocket: jest.fn(),
      unregisterSocket: jest.fn(),
    } as unknown as RealtimePresenceService,
    {
      startTyping: jest.fn(),
      stopTyping: jest.fn(),
    } as unknown as RealtimeTypingService,
    new ApplicationLifecycleState(),
  );
}

async function waitForReadiness(gateway: RealtimeGateway): Promise<void> {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    try {
      await gateway.checkReadiness();
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error('Realtime adapter did not recover on the stable endpoint');
}

class RedisHalfOpenProxy {
  private server: NetServer | null = null;
  private readonly sockets = new Set<NetSocket>();
  private suspended = false;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createNetServer((downstream) => {
        const upstream = createConnection({
          host: this.targetHost,
          port: this.targetPort,
        });

        let pairClosed = false;
        const closePair = (): void => {
          if (pairClosed) return;
          pairClosed = true;

          downstream.unpipe(upstream);
          upstream.unpipe(downstream);

          downstream.destroy();
          upstream.destroy();

          this.sockets.delete(downstream);
          this.sockets.delete(upstream);
        };

        this.track(downstream);
        this.track(upstream);

        downstream.on('error', closePair);
        upstream.on('error', closePair);

        downstream.once('end', closePair);
        upstream.once('end', closePair);

        downstream.once('close', closePair);
        upstream.once('close', closePair);

        downstream.pipe(upstream);
        upstream.pipe(downstream);
      });
      this.server = server;
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Redis proxy did not receive a TCP address'));
          return;
        }
        resolve(address.port);
      });
    });
  }

  suspendTraffic(): void {
    this.suspended = true;
    for (const socket of this.sockets) socket.pause();
  }

  resumeTraffic(): void {
    this.suspended = false;
    for (const socket of this.sockets) socket.resume();
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  openSocketCount(): number {
    return this.sockets.size;
  }

  private track(socket: NetSocket): void {
    this.sockets.add(socket);
    if (this.suspended) socket.pause();
  }
}

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeSocketServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
