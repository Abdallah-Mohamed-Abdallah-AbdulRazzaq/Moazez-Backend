import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from 'node:net';
import { randomUUID } from 'node:crypto';
import { ApplicationLifecycleState } from '../../src/bootstrap/application-lifecycle.state';
import type { Env } from '../../src/config/env.validation';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';
import type { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import type { RealtimeGateway } from '../../src/infrastructure/realtime/realtime.gateway';
import { RealtimeStateStoreService } from '../../src/infrastructure/realtime/realtime-state-store.service';
import type { StorageService } from '../../src/infrastructure/storage/storage.service';
import type { MediaRuntimeStartupGuard } from '../../src/modules/files/uploads/application/media-runtime-startup.guard';
import { createOperationalRoleManifests } from '../../src/modules/health/operational-probe.manifests';
import { OperationalProbeService } from '../../src/modules/health/operational-probe.service';
import type { TemporaryDiskProbe } from '../../src/modules/health/temporary-disk.probe';

jest.setTimeout(45_000);

describe('Realtime state-store fallback reconciliation', () => {
  const redisUrl = process.env.TEST_REDIS_URL;

  (redisUrl ? it : it.skip)(
    'restores presence and unexpired typing before API readiness recovers',
    async () => {
      const suffix = randomUUID();
      const schoolId = `school-${suffix}`;
      const userId = `user-${suffix}`;
      const secondUserId = `user-two-${suffix}`;
      const conversationId = `conversation-${suffix}`;
      const expiredConversationId = `expired-${suffix}`;
      const target = new URL(redisUrl as string);
      const admin = new IORedis(redisUrl as string, {
        maxRetriesPerRequest: 1,
      });
      await expect(admin.ping()).resolves.toBe('PONG');

      const proxy = new RedisProxy(
        target.hostname,
        Number(target.port || '6379'),
      );
      const port = await proxy.listen();
      const config = new ConfigService<Env, true>({
        REDIS_URL: `redis://127.0.0.1:${port}`,
      });
      const stateStore = new RealtimeStateStoreService(config);
      const probes = createProbeService(stateStore);

      try {
        await expect(stateStore.checkReadiness()).resolves.toBeUndefined();
        await stateStore.incrementPresence(
          schoolId,
          userId,
          'socket-before-outage',
          1,
        );
        expect(
          await admin.smembers(presenceSocketKey(schoolId, userId)),
        ).toEqual(['socket-before-outage']);

        await proxy.stop();
        await delay(1_100);
        expect(await admin.exists(presenceUserKey(schoolId, userId))).toBe(0);

        await stateStore.incrementPresence(
          schoolId,
          userId,
          'socket-during-outage',
          30,
        );
        await stateStore.incrementPresence(
          schoolId,
          secondUserId,
          'socket-second-user',
          30,
        );
        const activeTyping = await stateStore.setTyping(
          schoolId,
          conversationId,
          userId,
          8,
        );
        await stateStore.setTyping(
          schoolId,
          expiredConversationId,
          userId,
          1,
        );
        await delay(1_100);

        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 503 });

        await proxy.listen(port);
        await expect(stateStore.checkReadiness()).resolves.toBeUndefined();
        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 200 });

        await expect(
          admin.smembers(presenceSocketKey(schoolId, userId)),
        ).resolves.toEqual(
          expect.arrayContaining([
            'socket-before-outage',
            'socket-during-outage',
          ]),
        );
        await expect(
          admin.smembers(presenceSocketKey(schoolId, secondUserId)),
        ).resolves.toEqual(['socket-second-user']);
        await expect(admin.smembers(presenceUsersKey(schoolId))).resolves.toEqual(
          expect.arrayContaining([userId, secondUserId]),
        );

        const presenceTimestamp = await admin.get(
          presenceUserKey(schoolId, userId),
        );
        expect(new Date(presenceTimestamp as string).toISOString()).toBe(
          presenceTimestamp,
        );
        const presenceTtl = await admin.ttl(
          presenceSocketKey(schoolId, userId),
        );
        const presenceUsersTtl = await admin.ttl(presenceUsersKey(schoolId));
        expect(presenceTtl).toBeGreaterThan(0);
        expect(presenceTtl).toBeLessThanOrEqual(30);
        expect(presenceUsersTtl).toBeGreaterThan(0);
        expect(presenceUsersTtl).toBeLessThanOrEqual(90);

        const activeTypingKey = typingUserKey(
          schoolId,
          conversationId,
          userId,
        );
        await expect(admin.get(activeTypingKey)).resolves.toBe(
          activeTyping.startedAt,
        );
        await expect(
          admin.smembers(typingUsersKey(schoolId, conversationId)),
        ).resolves.toContain(userId);
        const typingTtl = await admin.ttl(activeTypingKey);
        expect(typingTtl).toBeGreaterThan(0);
        expect(typingTtl).toBeLessThan(8);
        await expect(
          admin.exists(
            typingUserKey(schoolId, expiredConversationId, userId),
          ),
        ).resolves.toBe(0);
        await expect(
          admin.sismember(
            typingUsersKey(schoolId, expiredConversationId),
            userId,
          ),
        ).resolves.toBe(0);
      } finally {
        await stateStore.onModuleDestroy();
        await proxy.stop();
        await deleteTestKeys(admin, suffix);
        await admin.quit();
      }

      expect(proxy.openSocketCount()).toBe(0);
    },
  );

  (redisUrl ? it : it.skip)(
    'keeps readiness unavailable after a real Redis reconciliation failure and retries',
    async () => {
      const suffix = randomUUID();
      const schoolId = `school-${suffix}`;
      const userId = `user-${suffix}`;
      const aclUser = `r5_${suffix.replaceAll('-', '')}`;
      const aclPassword = `synthetic-${suffix}`;
      const target = new URL(redisUrl as string);
      const admin = new IORedis(redisUrl as string, {
        maxRetriesPerRequest: 1,
      });
      await admin.call(
        'ACL',
        'SETUSER',
        aclUser,
        'on',
        `>${aclPassword}`,
        '~*',
        '+@all',
        '-eval',
      );
      const proxy = new RedisProxy(
        target.hostname,
        Number(target.port || '6379'),
      );
      const port = await proxy.listen();
      const stateStore = new RealtimeStateStoreService(
        new ConfigService<Env, true>({
          REDIS_URL: `redis://${aclUser}:${encodeURIComponent(
            aclPassword,
          )}@127.0.0.1:${port}`,
        }),
      );
      const probes = createProbeService(stateStore);

      try {
        await expect(
          stateStore.incrementPresence(
            schoolId,
            userId,
            'socket-retry',
            30,
          ),
        ).resolves.toMatchObject({ transitionedOnline: true });
        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 503 });
        await expect(
          admin.exists(presenceSocketKey(schoolId, userId)),
        ).resolves.toBe(0);

        await admin.call('ACL', 'SETUSER', aclUser, '+eval');
        await expect(stateStore.checkReadiness()).resolves.toBeUndefined();
        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 200 });
        await expect(
          admin.smembers(presenceSocketKey(schoolId, userId)),
        ).resolves.toEqual(['socket-retry']);
      } finally {
        await stateStore.onModuleDestroy();
        await proxy.stop();
        await deleteTestKeys(admin, suffix);
        await admin.call('ACL', 'DELUSER', aclUser);
        await admin.quit();
      }

      expect(proxy.openSocketCount()).toBe(0);
    },
  );

  (redisUrl ? it : it.skip)(
    'retires a half-open Redis client and recovers on the same stable endpoint',
    async () => {
      const target = new URL(redisUrl as string);
      const proxy = new RedisProxy(
        target.hostname,
        Number(target.port || '6379'),
      );
      const port = await proxy.listen();
      const stateStore = new RealtimeStateStoreService(
        new ConfigService<Env, true>({
          REDIS_URL: `redis://127.0.0.1:${port}`,
        }),
      );
      const probes = createProbeService(stateStore);

      try {
        await expect(stateStore.checkReadiness()).resolves.toBeUndefined();
        proxy.suspendTraffic();

        const outageStartedAt = Date.now();
        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 503 });
        expect(Date.now() - outageStartedAt).toBeLessThan(1_250);

        proxy.resumeTraffic();
        await expect(stateStore.checkReadiness()).resolves.toBeUndefined();
        await expect(
          probes.evaluate('api', 'readiness'),
        ).resolves.toMatchObject({ statusCode: 200 });
      } finally {
        proxy.resumeTraffic();
        await stateStore.onModuleDestroy();
        await proxy.stop();
      }

      expect(proxy.openSocketCount()).toBe(0);
    },
  );
});

class RedisProxy {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  private suspended = false;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  listen(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((incoming) => {
        const outgoing = createConnection({
          host: this.targetHost,
          port: this.targetPort,
        });
        this.track(incoming);
        this.track(outgoing);
        incoming.pipe(outgoing);
        outgoing.pipe(incoming);
      });
      this.server = server;
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
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

  private track(socket: Socket): void {
    this.sockets.add(socket);
    if (this.suspended) socket.pause();
    socket.once('close', () => this.sockets.delete(socket));
  }
}

function createProbeService(
  stateStore: RealtimeStateStoreService,
): OperationalProbeService {
  const service = new OperationalProbeService(
    new ApplicationLifecycleState(),
    {
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
    } as unknown as PrismaService,
    {
      ping: jest.fn().mockResolvedValue(undefined),
      hasAvailableWorkers: jest.fn().mockReturnValue(true),
    } as unknown as BullmqService,
    {
      checkReadiness: jest.fn().mockResolvedValue(undefined),
    } as unknown as RealtimeGateway,
    stateStore,
    {
      checkReadiness: jest.fn().mockResolvedValue(undefined),
    } as unknown as StorageService,
    {
      assertReady: jest.fn().mockResolvedValue(undefined),
      isVerified: jest.fn().mockReturnValue(true),
    } as unknown as MediaRuntimeStartupGuard,
    {
      checkReadiness: jest.fn().mockResolvedValue(undefined),
    } as unknown as TemporaryDiskProbe,
    createOperationalRoleManifests(),
  );
  service.markInitializationComplete();
  return service;
}

function presenceUserKey(schoolId: string, userId: string): string {
  return `realtime:presence:school:${schoolId}:user:${userId}`;
}

function presenceSocketKey(schoolId: string, userId: string): string {
  return `${presenceUserKey(schoolId, userId)}:sockets`;
}

function presenceUsersKey(schoolId: string): string {
  return `realtime:presence:school:${schoolId}:users`;
}

function typingUserKey(
  schoolId: string,
  conversationId: string,
  userId: string,
): string {
  return `realtime:typing:school:${schoolId}:conversation:${conversationId}:user:${userId}`;
}

function typingUsersKey(schoolId: string, conversationId: string): string {
  return `realtime:typing:school:${schoolId}:conversation:${conversationId}:users`;
}

async function deleteTestKeys(redis: IORedis, suffix: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      `realtime:*${suffix}*`,
      'COUNT',
      100,
    );
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
