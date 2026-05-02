import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { Env } from '../../config/env.validation';
import type {
  RealtimePresenceSnapshotItem,
  RealtimePresenceStoreResult,
} from './realtime-presence.types';

const REDIS_STATE_CONNECT_TIMEOUT_MS = 1000;
const PRESENCE_USERS_SET_TTL_BUFFER_SECONDS = 60;

const INCREMENT_PRESENCE_SCRIPT = `
local socketKey = KEYS[1]
local userKey = KEYS[2]
local usersKey = KEYS[3]
local socketId = ARGV[1]
local updatedAt = ARGV[2]
local ttlSeconds = tonumber(ARGV[3])
local usersTtlSeconds = tonumber(ARGV[4])
local userId = ARGV[5]

local added = redis.call('SADD', socketKey, socketId)
local count = redis.call('SCARD', socketKey)
redis.call('SET', userKey, updatedAt, 'EX', ttlSeconds)
redis.call('EXPIRE', socketKey, ttlSeconds)
redis.call('SADD', usersKey, userId)
redis.call('EXPIRE', usersKey, usersTtlSeconds)

return { count, added }
`;

const DECREMENT_PRESENCE_SCRIPT = `
local socketKey = KEYS[1]
local userKey = KEYS[2]
local usersKey = KEYS[3]
local socketId = ARGV[1]
local ttlSeconds = tonumber(ARGV[2])
local usersTtlSeconds = tonumber(ARGV[3])
local userId = ARGV[4]

local removed = redis.call('SREM', socketKey, socketId)
local count = redis.call('SCARD', socketKey)

if count <= 0 then
  redis.call('DEL', socketKey)
  redis.call('DEL', userKey)
  redis.call('SREM', usersKey, userId)
else
  redis.call('EXPIRE', socketKey, ttlSeconds)
  redis.call('EXPIRE', userKey, ttlSeconds)
  redis.call('EXPIRE', usersKey, usersTtlSeconds)
end

return { count, removed }
`;

const REFRESH_PRESENCE_SCRIPT = `
local socketKey = KEYS[1]
local userKey = KEYS[2]
local usersKey = KEYS[3]
local socketId = ARGV[1]
local updatedAt = ARGV[2]
local ttlSeconds = tonumber(ARGV[3])
local usersTtlSeconds = tonumber(ARGV[4])
local userId = ARGV[5]

if redis.call('SISMEMBER', socketKey, socketId) == 0 then
  return 0
end

redis.call('SET', userKey, updatedAt, 'EX', ttlSeconds)
redis.call('EXPIRE', socketKey, ttlSeconds)
redis.call('SADD', usersKey, userId)
redis.call('EXPIRE', usersKey, usersTtlSeconds)
return 1
`;

export interface RealtimeTypingUser {
  userId: string;
  startedAt: string;
  expiresAt: string;
}

@Injectable()
export class RealtimeStateStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeStateStoreService.name);
  private readonly memoryPresenceSockets = new Map<
    string,
    Map<string, Set<string>>
  >();
  private readonly memoryPresenceUpdatedAt = new Map<
    string,
    Map<string, string>
  >();
  private readonly memoryTypingUsers = new Map<
    string,
    Map<string, Map<string, { startedAt: string; expiresAtMs: number }>>
  >();
  private redis?: IORedis;
  private redisConnectPromise?: Promise<IORedis | null>;
  private redisUnavailable = false;
  private redisWarningLogged = false;

  constructor(private readonly configService: ConfigService<Env, true>) {}

  async incrementPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<RealtimePresenceStoreResult> {
    const updatedAt = new Date().toISOString();
    const redisResult = await this.withRedis(async (redis) => {
      const keys = presenceKeys(schoolId, userId);
      const [socketCount, added] = parseRedisPair(
        await redis.eval(
          INCREMENT_PRESENCE_SCRIPT,
          3,
          keys.socketSet,
          keys.user,
          keys.users,
          normalizeStateId(socketId, 'socketId'),
          updatedAt,
          String(ttlSeconds),
          String(presenceUsersSetTtl(ttlSeconds)),
          normalizeStateId(userId, 'userId'),
        ),
      );

      return {
        socketCount,
        updatedAt,
        transitionedOnline: socketCount === 1 && added === 1,
        transitionedOffline: false,
      };
    });

    return (
      redisResult ??
      this.incrementMemoryPresence(schoolId, userId, socketId, updatedAt)
    );
  }

  async decrementPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<RealtimePresenceStoreResult> {
    const updatedAt = new Date().toISOString();
    const redisResult = await this.withRedis(async (redis) => {
      const keys = presenceKeys(schoolId, userId);
      const [socketCount, removed] = parseRedisPair(
        await redis.eval(
          DECREMENT_PRESENCE_SCRIPT,
          3,
          keys.socketSet,
          keys.user,
          keys.users,
          normalizeStateId(socketId, 'socketId'),
          String(ttlSeconds),
          String(presenceUsersSetTtl(ttlSeconds)),
          normalizeStateId(userId, 'userId'),
        ),
      );

      return {
        socketCount,
        updatedAt,
        transitionedOnline: false,
        transitionedOffline: socketCount === 0 && removed === 1,
      };
    });

    return (
      redisResult ??
      this.decrementMemoryPresence(schoolId, userId, socketId, updatedAt)
    );
  }

  async refreshPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const updatedAt = new Date().toISOString();
    const redisResult = await this.withRedis(async (redis) => {
      const keys = presenceKeys(schoolId, userId);
      const refreshed = await redis.eval(
        REFRESH_PRESENCE_SCRIPT,
        3,
        keys.socketSet,
        keys.user,
        keys.users,
        normalizeStateId(socketId, 'socketId'),
        updatedAt,
        String(ttlSeconds),
        String(presenceUsersSetTtl(ttlSeconds)),
        normalizeStateId(userId, 'userId'),
      );

      return Number(refreshed) === 1;
    });

    if (redisResult !== null) return redisResult;

    return this.refreshMemoryPresence(schoolId, userId, socketId, updatedAt);
  }

  async getPresenceSnapshot(
    schoolId: string,
  ): Promise<RealtimePresenceSnapshotItem[]> {
    const redisResult = await this.withRedis((redis) =>
      this.getRedisPresenceSnapshot(redis, schoolId),
    );

    return redisResult ?? this.getMemoryPresenceSnapshot(schoolId);
  }

  async setTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<RealtimeTypingUser> {
    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const expiresAtMs = nowMs + ttlSeconds * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const redisResult = await this.withRedis(async (redis) => {
      const keys = typingKeys(schoolId, conversationId, userId);
      await redis
        .multi()
        .set(keys.user, startedAt, 'EX', ttlSeconds)
        .sadd(keys.users, normalizeStateId(userId, 'userId'))
        .expire(keys.users, ttlSeconds)
        .exec();

      return {
        userId: normalizeStateId(userId, 'userId'),
        startedAt,
        expiresAt,
      };
    });

    if (redisResult) return redisResult;

    return this.setMemoryTyping(
      schoolId,
      conversationId,
      userId,
      startedAt,
      expiresAtMs,
    );
  }

  async clearTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const redisCleared = await this.withRedis(async (redis) => {
      const keys = typingKeys(schoolId, conversationId, userId);
      await redis
        .multi()
        .del(keys.user)
        .srem(keys.users, normalizeStateId(userId, 'userId'))
        .exec();
      return true;
    });

    if (redisCleared) return;

    this.clearMemoryTyping(schoolId, conversationId, userId);
  }

  async getTypingUsers(
    schoolId: string,
    conversationId: string,
  ): Promise<RealtimeTypingUser[]> {
    const redisResult = await this.withRedis((redis) =>
      this.getRedisTypingUsers(redis, schoolId, conversationId),
    );

    return redisResult ?? this.getMemoryTypingUsers(schoolId, conversationId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedis();
  }

  private incrementMemoryPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    updatedAt: string,
  ): RealtimePresenceStoreResult {
    const schoolPresence = getOrCreateMap(
      this.memoryPresenceSockets,
      normalizeStateId(schoolId, 'schoolId'),
    );
    const userSockets = getOrCreateSet(
      schoolPresence,
      normalizeStateId(userId, 'userId'),
    );
    const hadSockets = userSockets.size > 0;
    const added = !userSockets.has(socketId);
    userSockets.add(normalizeStateId(socketId, 'socketId'));
    this.setMemoryPresenceUpdatedAt(schoolId, userId, updatedAt);

    return {
      socketCount: userSockets.size,
      updatedAt,
      transitionedOnline: !hadSockets && added,
      transitionedOffline: false,
    };
  }

  private decrementMemoryPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    updatedAt: string,
  ): RealtimePresenceStoreResult {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedUserId = normalizeStateId(userId, 'userId');
    const schoolPresence = this.memoryPresenceSockets.get(normalizedSchoolId);
    const userSockets = schoolPresence?.get(normalizedUserId);
    const removed = userSockets?.delete(normalizeStateId(socketId, 'socketId'));

    if (!userSockets || userSockets.size === 0) {
      schoolPresence?.delete(normalizedUserId);
      if (schoolPresence?.size === 0) {
        this.memoryPresenceSockets.delete(normalizedSchoolId);
      }
      this.memoryPresenceUpdatedAt
        .get(normalizedSchoolId)
        ?.delete(normalizedUserId);
    }

    return {
      socketCount: userSockets?.size ?? 0,
      updatedAt,
      transitionedOnline: false,
      transitionedOffline: Boolean(removed) && (userSockets?.size ?? 0) === 0,
    };
  }

  private refreshMemoryPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    updatedAt: string,
  ): boolean {
    const userSockets = this.memoryPresenceSockets
      .get(normalizeStateId(schoolId, 'schoolId'))
      ?.get(normalizeStateId(userId, 'userId'));

    if (!userSockets?.has(normalizeStateId(socketId, 'socketId'))) return false;

    this.setMemoryPresenceUpdatedAt(schoolId, userId, updatedAt);
    return true;
  }

  private setMemoryPresenceUpdatedAt(
    schoolId: string,
    userId: string,
    updatedAt: string,
  ): void {
    const schoolUpdatedAt = getOrCreateMap(
      this.memoryPresenceUpdatedAt,
      normalizeStateId(schoolId, 'schoolId'),
    );
    schoolUpdatedAt.set(normalizeStateId(userId, 'userId'), updatedAt);
  }

  private getMemoryPresenceSnapshot(
    schoolId: string,
  ): RealtimePresenceSnapshotItem[] {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const schoolPresence = this.memoryPresenceSockets.get(normalizedSchoolId);
    const schoolUpdatedAt =
      this.memoryPresenceUpdatedAt.get(normalizedSchoolId);
    if (!schoolPresence) return [];

    return [...schoolPresence.entries()]
      .filter(([, sockets]) => sockets.size > 0)
      .map(([userId]) => ({
        userId,
        online: true as const,
        updatedAt: schoolUpdatedAt?.get(userId) ?? new Date(0).toISOString(),
      }))
      .sort(compareByUserId);
  }

  private setMemoryTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
    startedAt: string,
    expiresAtMs: number,
  ): RealtimeTypingUser {
    const conversationUsers = getOrCreateMap(
      getOrCreateMap(
        this.memoryTypingUsers,
        normalizeStateId(schoolId, 'schoolId'),
      ),
      normalizeStateId(conversationId, 'conversationId'),
    );
    const normalizedUserId = normalizeStateId(userId, 'userId');

    conversationUsers.set(normalizedUserId, { startedAt, expiresAtMs });

    return {
      userId: normalizedUserId,
      startedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  private clearMemoryTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
  ): void {
    const schoolTyping = this.memoryTypingUsers.get(
      normalizeStateId(schoolId, 'schoolId'),
    );
    const conversationTyping = schoolTyping?.get(
      normalizeStateId(conversationId, 'conversationId'),
    );
    conversationTyping?.delete(normalizeStateId(userId, 'userId'));

    if (conversationTyping?.size === 0) {
      schoolTyping?.delete(normalizeStateId(conversationId, 'conversationId'));
    }
    if (schoolTyping?.size === 0) {
      this.memoryTypingUsers.delete(normalizeStateId(schoolId, 'schoolId'));
    }
  }

  private getMemoryTypingUsers(
    schoolId: string,
    conversationId: string,
  ): RealtimeTypingUser[] {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedConversationId = normalizeStateId(
      conversationId,
      'conversationId',
    );
    const schoolTyping = this.memoryTypingUsers.get(normalizedSchoolId);
    const conversationTyping = schoolTyping?.get(normalizedConversationId);
    if (!conversationTyping) return [];

    const nowMs = Date.now();
    for (const [userId, state] of conversationTyping.entries()) {
      if (state.expiresAtMs <= nowMs) {
        conversationTyping.delete(userId);
      }
    }

    if (conversationTyping.size === 0) {
      schoolTyping?.delete(normalizedConversationId);
      if (schoolTyping?.size === 0) {
        this.memoryTypingUsers.delete(normalizedSchoolId);
      }
      return [];
    }

    return [...conversationTyping.entries()]
      .map(([userId, state]) => ({
        userId,
        startedAt: state.startedAt,
        expiresAt: new Date(state.expiresAtMs).toISOString(),
      }))
      .sort(compareByUserId);
  }

  private async getRedisPresenceSnapshot(
    redis: IORedis,
    schoolId: string,
  ): Promise<RealtimePresenceSnapshotItem[]> {
    const usersKey = presenceUsersKey(schoolId);
    const userIds = (await redis.smembers(usersKey)).sort();
    if (userIds.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      pipeline.get(presenceUserKey(schoolId, userId));
    }
    const results = await pipeline.exec();
    const staleUserIds: string[] = [];
    const snapshot: RealtimePresenceSnapshotItem[] = [];

    userIds.forEach((userId, index) => {
      const updatedAt = results?.[index]?.[1];
      if (typeof updatedAt !== 'string') {
        staleUserIds.push(userId);
        return;
      }

      snapshot.push({ userId, online: true, updatedAt });
    });

    if (staleUserIds.length > 0) {
      await redis.srem(usersKey, ...staleUserIds);
    }

    return snapshot;
  }

  private async getRedisTypingUsers(
    redis: IORedis,
    schoolId: string,
    conversationId: string,
  ): Promise<RealtimeTypingUser[]> {
    const usersKey = typingUsersKey(schoolId, conversationId);
    const userIds = (await redis.smembers(usersKey)).sort();
    if (userIds.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      const keys = typingKeys(schoolId, conversationId, userId);
      pipeline.get(keys.user);
      pipeline.ttl(keys.user);
    }

    const results = await pipeline.exec();
    const staleUserIds: string[] = [];
    const typingUsers: RealtimeTypingUser[] = [];

    userIds.forEach((userId, index) => {
      const valueIndex = index * 2;
      const ttlIndex = valueIndex + 1;
      const startedAt = results?.[valueIndex]?.[1];
      const ttlSeconds = Number(results?.[ttlIndex]?.[1]);

      if (typeof startedAt !== 'string' || ttlSeconds <= 0) {
        staleUserIds.push(userId);
        return;
      }

      typingUsers.push({
        userId,
        startedAt,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      });
    });

    if (staleUserIds.length > 0) {
      await redis.srem(usersKey, ...staleUserIds);
    }

    return typingUsers;
  }

  private async withRedis<T>(
    fn: (redis: IORedis) => Promise<T>,
  ): Promise<T | null> {
    const redis = await this.getRedisClient();
    if (!redis) return null;

    try {
      return await fn(redis);
    } catch {
      this.markRedisUnavailable();
      return null;
    }
  }

  private async getRedisClient(): Promise<IORedis | null> {
    if (this.redisUnavailable) return null;
    if (this.redis?.status === 'ready') return this.redis;

    if (!this.redisConnectPromise) {
      this.redisConnectPromise = this.connectRedisClient();
    }

    try {
      return await this.redisConnectPromise;
    } finally {
      this.redisConnectPromise = undefined;
    }
  }

  private async connectRedisClient(): Promise<IORedis | null> {
    const redisUrl = this.configService.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      this.markRedisUnavailable();
      return null;
    }

    if (!this.redis) {
      this.redis = new IORedis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: REDIS_STATE_CONNECT_TIMEOUT_MS,
        retryStrategy: () => null,
      });
      this.redis.on('error', () => this.logRedisFallbackWarning());
    }

    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.redis.connect(),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('Realtime state Redis connection timed out')),
            REDIS_STATE_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
      return this.redis;
    } catch {
      this.markRedisUnavailable();
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private markRedisUnavailable(): void {
    this.redisUnavailable = true;
    this.logRedisFallbackWarning();
    this.redis?.disconnect();
  }

  private logRedisFallbackWarning(): void {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn(
      'Realtime state Redis unavailable; using in-memory presence and typing state.',
    );
  }

  private async closeRedis(): Promise<void> {
    const redis = this.redis;
    if (!redis) return;

    if (
      redis.status === 'ready' ||
      redis.status === 'connect' ||
      redis.status === 'connecting' ||
      redis.status === 'reconnecting'
    ) {
      try {
        await redis.quit();
        return;
      } catch {
        redis.disconnect();
        return;
      }
    }

    redis.disconnect();
  }
}

function presenceKeys(
  schoolId: string,
  userId: string,
): { socketSet: string; user: string; users: string } {
  return {
    socketSet: `${presenceUserKey(schoolId, userId)}:sockets`,
    user: presenceUserKey(schoolId, userId),
    users: presenceUsersKey(schoolId),
  };
}

function presenceUserKey(schoolId: string, userId: string): string {
  return `realtime:presence:school:${normalizeStateId(
    schoolId,
    'schoolId',
  )}:user:${normalizeStateId(userId, 'userId')}`;
}

function presenceUsersKey(schoolId: string): string {
  return `realtime:presence:school:${normalizeStateId(
    schoolId,
    'schoolId',
  )}:users`;
}

function typingKeys(
  schoolId: string,
  conversationId: string,
  userId: string,
): { user: string; users: string } {
  return {
    user: `realtime:typing:school:${normalizeStateId(
      schoolId,
      'schoolId',
    )}:conversation:${normalizeStateId(
      conversationId,
      'conversationId',
    )}:user:${normalizeStateId(userId, 'userId')}`,
    users: typingUsersKey(schoolId, conversationId),
  };
}

function typingUsersKey(schoolId: string, conversationId: string): string {
  return `realtime:typing:school:${normalizeStateId(
    schoolId,
    'schoolId',
  )}:conversation:${normalizeStateId(conversationId, 'conversationId')}:users`;
}

function normalizeStateId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required for realtime state`);
  }

  return normalized;
}

function presenceUsersSetTtl(ttlSeconds: number): number {
  return ttlSeconds + PRESENCE_USERS_SET_TTL_BUFFER_SECONDS;
}

function parseRedisPair(value: unknown): [number, number] {
  if (!Array.isArray(value)) return [0, 0];
  return [Number(value[0] ?? 0), Number(value[1] ?? 0)];
}

function getOrCreateMap<TKey, TValue>(
  root: Map<TKey, Map<string, TValue>>,
  key: TKey,
): Map<string, TValue> {
  const existing = root.get(key);
  if (existing) return existing;

  const created = new Map<string, TValue>();
  root.set(key, created);
  return created;
}

function getOrCreateSet(
  root: Map<string, Set<string>>,
  key: string,
): Set<string> {
  const existing = root.get(key);
  if (existing) return existing;

  const created = new Set<string>();
  root.set(key, created);
  return created;
}

function compareByUserId<T extends { userId: string }>(
  left: T,
  right: T,
): number {
  return left.userId.localeCompare(right.userId);
}
