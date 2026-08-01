import { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, type Socket } from 'socket.io';
import WebSocket from 'ws';
import { ApplicationLifecycleState } from '../../src/bootstrap/application-lifecycle.state';
import type { Env } from '../../src/config/env.validation';
import type { RealtimeAuthService } from '../../src/infrastructure/realtime/realtime-auth.service';
import type { RealtimeCommunicationAccessService } from '../../src/infrastructure/realtime/realtime-communication-access.service';
import { REALTIME_CLIENT_COMMANDS } from '../../src/infrastructure/realtime/realtime-event-names';
import {
  RealtimeGateway,
  REALTIME_NAMESPACE,
} from '../../src/infrastructure/realtime/realtime.gateway';
import type { RealtimePresenceService } from '../../src/infrastructure/realtime/realtime-presence.service';
import {
  conversationRoom,
  schoolRoom,
  userRoom,
} from '../../src/infrastructure/realtime/realtime-room-names';
import type { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import type { RealtimeTypingService } from '../../src/infrastructure/realtime/realtime-typing.service';
import type { RealtimeSocket } from '../../src/infrastructure/realtime/realtime.types';

jest.setTimeout(30_000);

describe('Realtime Redis adapter recovery with connected sockets', () => {
  const redisUrl = process.env.TEST_REDIS_URL;

  (redisUrl ? it : it.skip)(
    'disconnects before replacement and requires room-safe reauthentication',
    async () => {
      const lifecycle = new ApplicationLifecycleState();
      const authService = {
        authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
      };
      const presenceCleanupStarted = deferred<void>();
      const presenceCleanupFinished = deferred<void>();
      const authenticationStarted = deferred<void>();
      const authenticationCompletion =
        deferred<ReturnType<typeof authenticatedContext>>();
      const presence = {
        registerSocket: jest.fn().mockResolvedValue(undefined),
        unregisterSocket: jest.fn().mockImplementation(() => {
          presenceCleanupStarted.resolve();
          return presenceCleanupFinished.promise;
        }),
      };
      const gateway = new RealtimeGateway(
        authService as unknown as RealtimeAuthService,
        {
          canJoinConversationRoom: jest.fn().mockResolvedValue(true),
          isOnlinePresenceEnabled: jest.fn().mockResolvedValue(true),
        } as unknown as RealtimeCommunicationAccessService,
        {
          bindServer: jest.fn(),
        } as unknown as RealtimePublisherService,
        new ConfigService<Env, true>({ REDIS_URL: redisUrl }),
        presence as unknown as RealtimePresenceService,
        {
          startTyping: jest.fn(),
          stopTyping: jest.fn(),
        } as unknown as RealtimeTypingService,
        lifecycle,
      );
      const httpServer = createServer();
      const socketServer = new Server(httpServer, { serveClient: false });
      const namespace = socketServer.of(REALTIME_NAMESPACE);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        await gateway.afterInit(namespace);
        installGatewayHandlers(namespace, gateway);
        const port = await listen(httpServer);

        const first = await RawSocketIoClient.connect(port);
        const firstReady = await first.waitFor('test:ready');
        expect(firstReady).toEqual(
          expect.arrayContaining([
            schoolRoom('school-r4'),
            userRoom('school-r4', 'user-r4'),
          ]),
        );
        await joinConversation(first);
        await expectDelivery(namespace, first, 'before');

        authService.authenticate.mockImplementationOnce(() => {
          authenticationStarted.resolve();
          return authenticationCompletion.promise;
        });
        const racing = await RawSocketIoClient.connect(port);
        await authenticationStarted.promise;

        const owned = gateway as unknown as {
          redisPublisher: { disconnect(): void };
          redisSubscriber: { disconnect(): void };
          redisAdapterReadinessPromise: Promise<boolean> | null;
        };
        owned.redisPublisher.disconnect();
        owned.redisSubscriber.disconnect();

        const firstClosed = first.waitForClose();
        const racingClosed = racing.waitForClose();
        const triggeringReadiness = gateway.checkReadiness();

        await expect(triggeringReadiness).rejects.toThrow(
          'realtime_redis_unavailable',
        );

        const recovery = owned.redisAdapterReadinessPromise;
        expect(recovery).not.toBeNull();

        if (!recovery) {
          throw new Error('Expected an owned Redis adapter recovery flight');
        }

        let recoverySettled = false;
        void recovery.then(
          () => {
            recoverySettled = true;
          },
          () => {
            recoverySettled = true;
          },
        );
        await firstClosed;
        await presenceCleanupStarted.promise;
        await Promise.resolve();
        expect(recoverySettled).toBe(false);
        presenceCleanupFinished.resolve();
        authenticationCompletion.resolve(authenticatedContext());
        await racingClosed;
        await expect(recovery).resolves.toBe(true);
        await expect(gateway.checkReadiness()).resolves.toBeUndefined();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(presence.unregisterSocket).toHaveBeenCalledWith(
          expect.objectContaining({
            schoolId: 'school-r4',
            userId: 'user-r4',
          }),
        );
        expect(presence.registerSocket).toHaveBeenCalledTimes(1);

        const second = await RawSocketIoClient.connect(port);
        const secondReady = await second.waitFor('test:ready');
        expect(secondReady).toEqual(
          expect.arrayContaining([
            schoolRoom('school-r4'),
            userRoom('school-r4', 'user-r4'),
          ]),
        );
        await joinConversation(second);
        await expectDelivery(namespace, second, 'after');

        await gateway.onModuleDestroy();
        await second.waitForClose();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
      } finally {
        presenceCleanupFinished.resolve();
        authenticationCompletion.resolve(authenticatedContext());
        process.off('unhandledRejection', onUnhandled);
        await gateway.onModuleDestroy();
        await closeSocketServer(socketServer);
        await closeHttpServer(httpServer);
      }
    },
  );

  (redisUrl ? it : it.skip)(
    'disconnects sockets owned by the initial in-memory adapter before replacement',
    async () => {
      const httpServer = createServer();
      const socketServer = new Server(httpServer, { serveClient: false });
      const namespace = socketServer.of(REALTIME_NAMESPACE);
      const port = await listen(httpServer);
      const existing = await RawSocketIoClient.connect(port);
      const gateway = new RealtimeGateway(
        {
          authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
        } as unknown as RealtimeAuthService,
        {
          canJoinConversationRoom: jest.fn().mockResolvedValue(true),
          isOnlinePresenceEnabled: jest.fn().mockResolvedValue(true),
        } as unknown as RealtimeCommunicationAccessService,
        { bindServer: jest.fn() } as unknown as RealtimePublisherService,
        new ConfigService<Env, true>({ REDIS_URL: redisUrl }),
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

      try {
        const closed = existing.waitForClose();
        await gateway.afterInit(namespace);
        await closed;
        await expect(gateway.checkReadiness()).resolves.toBeUndefined();
        expect(namespace.sockets.size).toBe(0);
      } finally {
        await gateway.onModuleDestroy();
        await closeSocketServer(socketServer);
        await closeHttpServer(httpServer);
      }
    },
  );
});

function authenticatedContext() {
  return {
    actorId: 'user-r4',
    userType: UserType.SCHOOL_USER,
    membershipId: 'membership-r4',
    schoolId: 'school-r4',
    organizationId: 'organization-r4',
    roleId: 'role-r4',
    permissions: ['communication.messages.view'],
    sessionId: 'session-r4',
    actor: { id: 'user-r4', type: UserType.SCHOOL_USER },
  };
}

function installGatewayHandlers(
  namespace: ReturnType<Server['of']>,
  gateway: RealtimeGateway,
): void {
  namespace.on('connection', (socket) => {
    socket.on('disconnect', () => {
      void gateway.handleDisconnect(socket as unknown as RealtimeSocket);
    });
    socket.on(
      REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_JOIN,
      (payload: unknown) => {
        void gateway
          .handleConversationJoin(
            socket as unknown as RealtimeSocket,
            payload,
          )
          .then(() => {
            socket.emit('test:conversation-ready', [...socket.rooms]);
          });
      },
    );
    void gateway
      .handleConnection(socket as unknown as RealtimeSocket)
      .then(() => socket.emit('test:ready', [...socket.rooms]));
  });
}

async function joinConversation(client: RawSocketIoClient): Promise<void> {
  client.emit(
    REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_JOIN,
    { conversationId: 'conversation-r4' },
  );
  await expect(client.waitFor('test:conversation-ready')).resolves.toEqual(
    expect.arrayContaining([
      conversationRoom('school-r4', 'conversation-r4'),
    ]),
  );
}

async function expectDelivery(
  namespace: ReturnType<Server['of']>,
  client: RawSocketIoClient,
  suffix: string,
): Promise<void> {
  const school = client.waitFor(`test:school:${suffix}`);
  const user = client.waitFor(`test:user:${suffix}`);
  const conversation = client.waitFor(`test:conversation:${suffix}`);
  namespace
    .to(schoolRoom('school-r4'))
    .emit(`test:school:${suffix}`, 'school');
  namespace
    .to(userRoom('school-r4', 'user-r4'))
    .emit(`test:user:${suffix}`, 'user');
  namespace
    .to(conversationRoom('school-r4', 'conversation-r4'))
    .emit(`test:conversation:${suffix}`, 'conversation');
  await expect(Promise.all([school, user, conversation])).resolves.toEqual([
    'school',
    'user',
    'conversation',
  ]);
}

class RawSocketIoClient {
  private readonly events = new Map<string, unknown[]>();
  private readonly waiters = new Map<
    string,
    Array<(value: unknown) => void>
  >();
  private closed = false;
  private readonly closeWaiters: Array<() => void> = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.handleMessage(data.toString()));
    socket.on('close', () => {
      this.closed = true;
      for (const resolve of this.closeWaiters.splice(0)) resolve();
    });
  }

  static connect(port: number): Promise<RawSocketIoClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`,
      );
      const client = new RawSocketIoClient(socket);
      const timeout = setTimeout(
        () => reject(new Error('Socket.IO connection timed out')),
        5_000,
      );
      socket.once('error', reject);
      socket.on('message', (data) => {
        if (!data.toString().startsWith('0')) return;
        socket.send(`40${REALTIME_NAMESPACE},`);
      });
      socket.on('message', (data) => {
        if (!data.toString().startsWith(`40${REALTIME_NAMESPACE},`)) return;
        clearTimeout(timeout);
        resolve(client);
      });
    });
  }

  emit(event: string, payload: unknown): void {
    this.socket.send(
      `42${REALTIME_NAMESPACE},${JSON.stringify([event, payload])}`,
    );
  }

  waitFor(event: string): Promise<unknown> {
    const queued = this.events.get(event);
    if (queued?.length) return Promise.resolve(queued.shift());
    return withTimeout(
      new Promise((resolve) => {
        const waiters = this.waiters.get(event) ?? [];
        waiters.push(resolve);
        this.waiters.set(event, waiters);
      }),
    );
  }

  waitForClose(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return withTimeout(
      new Promise((resolve) => {
        this.closeWaiters.push(resolve);
      }),
    );
  }

  private handleMessage(packet: string): void {
    if (packet === '2') {
      this.socket.send('3');
      return;
    }
    const prefix = `42${REALTIME_NAMESPACE},`;
    if (!packet.startsWith(prefix)) return;
    const [event, payload] = JSON.parse(packet.slice(prefix.length)) as [
      string,
      unknown,
    ];
    const waiter = this.waiters.get(event)?.shift();
    if (waiter) {
      waiter(payload);
      return;
    }
    const queued = this.events.get(event) ?? [];
    queued.push(payload);
    this.events.set(event, queued);
  }
}

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
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

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Socket event timed out')), 5_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
