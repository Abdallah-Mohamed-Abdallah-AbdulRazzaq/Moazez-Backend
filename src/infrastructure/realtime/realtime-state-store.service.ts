import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { Env } from '../../config/env.validation';
import type {
  RealtimePresenceSnapshotItem,
  RealtimePresenceStoreResult,
} from './realtime-presence.types';

const REDIS_STATE_CONNECT_TIMEOUT_MS = 1000;
const REDIS_STATE_COMMAND_TIMEOUT_MS = 1000;
const REDIS_STATE_READINESS_TIMEOUT_MS = 600;
const REDIS_STATE_STORE_CLOSE_TIMEOUT_MS = 1000;
const REDIS_STATE_RECOVERY_CANDIDATE_INVALID =
  'realtime_state_recovery_candidate_invalid';
const PRESENCE_USERS_SET_TTL_BUFFER_SECONDS = 60;
const LOCAL_TYPING_SWEEP_INTERVAL_MS = 4000;

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

export type RealtimeStateStoreLifecycleState =
  | 'initializing'
  | 'ready'
  | 'fallback'
  | 'recovering'
  | 'reconciling'
  | 'unavailable'
  | 'destroying';

export interface RealtimeTypingUser {
  userId: string;
  startedAt: string;
  expiresAt: string;
}

interface LocalPresenceOwner {
  schoolId: string;
  userId: string;
  socketId: string;
  updatedAt: string;
  ttlSeconds: number;
}

interface LocalTypingOwner {
  schoolId: string;
  conversationId: string;
  userId: string;
  startedAt: string;
  expiresAtMs: number;
}

@Injectable()
export class RealtimeStateStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeStateStoreService.name);
  private readonly localPresence = new Map<
    string,
    Map<string, Map<string, LocalPresenceOwner>>
  >();
  private readonly localTyping = new Map<
    string,
    Map<string, Map<string, LocalTypingOwner>>
  >();
  private lifecycleState: RealtimeStateStoreLifecycleState = 'initializing';
  private redis?: IORedis;
  private recoveryPromise: Promise<IORedis | null> | null = null;
  private readonly redisClientClosePromises = new WeakMap<
    IORedis,
    Promise<void>
  >();
  private readonly redisClientRetirements = new Set<Promise<void>>();
  private readonly forceDisconnectedRedisClients = new WeakSet<IORedis>();
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly localTypingSweepTimer: NodeJS.Timeout;
  private localTypingSweepPromise: Promise<void> | null = null;
  private localTypingSweepTimerCleared = false;
  private destroyPromise: Promise<void> | null = null;
  private redisWarningLogged = false;
  private readonly allowLocalFallback: boolean;

  constructor(private readonly configService: ConfigService<Env, true>) {
    const environment = this.configService.get('NODE_ENV', { infer: true });
    this.allowLocalFallback =
      environment !== 'staging' && environment !== 'production';
    this.localTypingSweepTimer = setInterval(() => {
      void this.runLocalTypingSweep();
    }, LOCAL_TYPING_SWEEP_INTERVAL_MS);
    this.localTypingSweepTimer.unref();
  }

  async checkReadiness(): Promise<void> {
    if (this.lifecycleState === 'destroying') {
      throw new Error('realtime_state_redis_unavailable');
    }

    if (
      this.lifecycleState !== 'ready' ||
      this.redis?.status !== 'ready'
    ) {
      const recovered = await this.ensureRedisReady();
      if (!recovered || this.lifecycleState !== 'ready') {
        throw new Error('realtime_state_redis_unavailable');
      }
      return;
    }

    const redis = this.redis;
    try {
      await this.pingRedisForReadiness(redis);
      this.redisWarningLogged = false;
    } catch {
      this.markRedisUnavailable(redis);
      throw new Error('realtime_state_redis_unavailable');
    }
  }

  async incrementPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<RealtimePresenceStoreResult> {
    const redis = await this.getRedisForOperation();

    return this.runSerialized(async () => {
      const updatedAt = new Date().toISOString();
      const localResult = this.incrementLocalPresence(
        schoolId,
        userId,
        socketId,
        ttlSeconds,
        updatedAt,
      );
      if (!this.canUseRedis(redis)) {
        this.setFallbackState();
        return this.localFallbackOrThrow(localResult);
      }

      try {
        return await this.incrementRedisPresence(
          redis,
          schoolId,
          userId,
          socketId,
          ttlSeconds,
          updatedAt,
        );
      } catch {
        this.markRedisUnavailable(redis);
        return this.localFallbackOrThrow(localResult);
      }
    });
  }

  async decrementPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<RealtimePresenceStoreResult> {
    const redis = await this.getRedisForOperation();

    return this.runSerialized(async () => {
      const updatedAt = new Date().toISOString();
      const localResult = this.decrementLocalPresence(
        schoolId,
        userId,
        socketId,
        updatedAt,
      );
      if (!this.canUseRedis(redis)) {
        this.setFallbackState();
        return this.localFallbackOrThrow(localResult);
      }

      try {
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
      } catch {
        this.markRedisUnavailable(redis);
        return this.localFallbackOrThrow(localResult);
      }
    });
  }

  async refreshPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redis = await this.getRedisForOperation();

    return this.runSerialized(async () => {
      const updatedAt = new Date().toISOString();
      const localOwner = this.refreshLocalPresence(
        schoolId,
        userId,
        socketId,
        ttlSeconds,
        updatedAt,
      );
      if (!localOwner) return false;
      if (!this.canUseRedis(redis)) {
        this.setFallbackState();
        return this.localFallbackOrThrow(true);
      }

      try {
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
      } catch {
        this.markRedisUnavailable(redis);
        return this.localFallbackOrThrow(true);
      }
    });
  }

  async restorePresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redis = await this.getRedisForOperation();

    return this.runSerialized(async () => {
      const owner = this.findLocalPresenceOwner(schoolId, userId, socketId);
      if (!owner) return false;
      owner.ttlSeconds = ttlSeconds;
      owner.updatedAt = new Date().toISOString();
      if (!this.canUseRedis(redis)) {
        this.setFallbackState();
        return this.localFallbackOrThrow(false);
      }

      try {
        await this.incrementRedisPresence(
          redis,
          owner.schoolId,
          owner.userId,
          owner.socketId,
          owner.ttlSeconds,
          owner.updatedAt,
        );
        return true;
      } catch {
        this.markRedisUnavailable(redis);
        return this.localFallbackOrThrow(false);
      }
    });
  }

  async getPresenceSnapshot(
    schoolId: string,
  ): Promise<RealtimePresenceSnapshotItem[]> {
    const redis = await this.getRedisForOperation();
    if (this.canUseRedis(redis)) {
      try {
        return await this.getRedisPresenceSnapshot(redis, schoolId);
      } catch {
        this.markRedisUnavailable(redis);
      }
    }

    return this.localFallbackOrThrow(this.getLocalPresenceSnapshot(schoolId));
  }

  async setTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<RealtimeTypingUser> {
    const redis = await this.getRedisForOperation();

    return this.runSerialized(async () => {
      const nowMs = Date.now();
      const owner = this.allowLocalFallback
        ? this.setLocalTyping(
            schoolId,
            conversationId,
            userId,
            new Date(nowMs).toISOString(),
            nowMs + ttlSeconds * 1000,
          )
        : createLocalTypingOwner(
            schoolId,
            conversationId,
            userId,
            new Date(nowMs).toISOString(),
            nowMs + ttlSeconds * 1000,
          );
      if (this.canUseRedis(redis)) {
        try {
          await this.writeRedisTyping(redis, owner, ttlSeconds);
        } catch {
          this.markRedisUnavailable(redis);
          return this.localFallbackOrThrow(typingUser(owner));
        }
      } else {
        this.setFallbackState();
        return this.localFallbackOrThrow(typingUser(owner));
      }

      return typingUser(owner);
    });
  }

  async clearTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const redis = await this.getRedisForOperation();

    await this.runSerialized(async () => {
      if (this.allowLocalFallback) {
        this.clearLocalTyping(schoolId, conversationId, userId);
      }
      if (!this.canUseRedis(redis)) {
        this.setFallbackState();
        this.localFallbackOrThrow(undefined);
        return;
      }

      try {
        const keys = typingKeys(schoolId, conversationId, userId);
        const result = await redis
          .multi()
          .del(keys.user)
          .srem(keys.users, normalizeStateId(userId, 'userId'))
          .exec();
        assertRedisTransaction(result);
      } catch {
        this.markRedisUnavailable(redis);
        this.localFallbackOrThrow(undefined);
      }
    });
  }

  async getTypingUsers(
    schoolId: string,
    conversationId: string,
  ): Promise<RealtimeTypingUser[]> {
    const redis = await this.getRedisForOperation();
    if (this.canUseRedis(redis)) {
      try {
        return await this.getRedisTypingUsers(redis, schoolId, conversationId);
      } catch {
        this.markRedisUnavailable(redis);
      }
    }

    return this.localFallbackOrThrow(
      this.getLocalTypingUsers(schoolId, conversationId),
    );
  }

  onModuleDestroy(): Promise<void> {
    this.lifecycleState = 'destroying';
    this.clearLocalTypingSweepTimer();
    if (!this.destroyPromise) {
      this.destroyPromise = this.destroy();
    }
    return this.destroyPromise;
  }

  private async getRedisForOperation(): Promise<IORedis | null> {
    if (
      this.lifecycleState === 'ready' &&
      this.redis?.status === 'ready'
    ) {
      return this.redis;
    }
    return this.ensureRedisReady();
  }

  private ensureRedisReady(): Promise<IORedis | null> {
    if (this.lifecycleState === 'destroying') return Promise.resolve(null);
    if (
      this.lifecycleState === 'ready' &&
      this.redis?.status === 'ready'
    ) {
      return Promise.resolve(this.redis);
    }
    if (this.recoveryPromise) return this.recoveryPromise;

    this.lifecycleState = 'recovering';
    const execution = this.connectAndReconcile().finally(() => {
      if (this.recoveryPromise === execution) {
        this.recoveryPromise = null;
      }
    });
    this.recoveryPromise = execution;
    return execution;
  }

  private async connectAndReconcile(): Promise<IORedis | null> {
    const redisUrl = this.configService.get('REALTIME_REDIS_URL', {
      infer: true,
    });
    if (!redisUrl) {
      this.setFallbackState();
      this.logRedisFallbackWarning();
      return null;
    }

    const previous = this.redis;
    const candidate = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      connectTimeout: REDIS_STATE_CONNECT_TIMEOUT_MS,
      disconnectTimeout: REDIS_STATE_STORE_CLOSE_TIMEOUT_MS,
      commandTimeout: REDIS_STATE_COMMAND_TIMEOUT_MS,
      retryStrategy: () => null,
    });
    candidate.on('error', () => this.logRedisFallbackWarning());

    try {
      await this.connectRedisClient(candidate);
      await this.pingRedisForReadiness(candidate);
      if (this.isDestroying()) {
        await this.closeRedisClient(candidate);
        return null;
      }

      this.lifecycleState = 'reconciling';
      await this.runSerialized(() => this.reconcileLocalState(candidate));
      if (this.isDestroying()) {
        await this.closeRedisClient(candidate);
        return null;
      }

      this.redis = candidate;
      if (previous && previous !== candidate) {
        await this.closeRedisClient(previous);
      }

      this.assertRecoveryCandidateReady(candidate);
      await this.pingRedisForReadiness(candidate);
      this.assertRecoveryCandidateReady(candidate);

      this.lifecycleState = 'ready';
      this.redisWarningLogged = false;
      return candidate;
    } catch {
      if (this.redis === candidate || this.redis === previous) {
        this.redis = undefined;
      }
      await Promise.all([
        this.closeRedisClient(candidate),
        this.closeRedisClient(previous),
      ]);
      if (!this.redis) {
        this.setFallbackState();
        this.logRedisFallbackWarning();
      }
      return null;
    }
  }

  private async connectRedisClient(redis: IORedis): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        redis.connect(),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('realtime_state_connect_timeout')),
            REDIS_STATE_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async pingRedisForReadiness(redis: IORedis): Promise<void> {
    const result = await settleRedisClose(
      Promise.resolve().then(() => redis.ping()),
      REDIS_STATE_READINESS_TIMEOUT_MS,
    );
    if (result !== 'fulfilled') {
      throw new Error('realtime_state_redis_unavailable');
    }
  }

  private async reconcileLocalState(redis: IORedis): Promise<void> {
    this.removeExpiredLocalTyping();

    for (const school of this.localPresence.values()) {
      for (const user of school.values()) {
        const owners = [...user.values()].sort((left, right) =>
          left.updatedAt.localeCompare(right.updatedAt),
        );
        for (const owner of owners) {
          await this.incrementRedisPresence(
            redis,
            owner.schoolId,
            owner.userId,
            owner.socketId,
            owner.ttlSeconds,
            owner.updatedAt,
          );
        }
      }
    }

    if (!this.allowLocalFallback) return;

    const nowMs = Date.now();
    const activeTyping: Array<{
      owner: LocalTypingOwner;
      remainingTtlSeconds: number;
    }> = [];
    for (const school of this.localTyping.values()) {
      for (const conversation of school.values()) {
        for (const owner of conversation.values()) {
          const remainingTtlSeconds = Math.ceil(
            (owner.expiresAtMs - nowMs) / 1000,
          );
          if (remainingTtlSeconds <= 0) continue;
          activeTyping.push({ owner, remainingTtlSeconds });
        }
      }
    }
    activeTyping.sort(
      (left, right) =>
        left.remainingTtlSeconds - right.remainingTtlSeconds,
    );
    for (const entry of activeTyping) {
      await this.writeRedisTyping(
        redis,
        entry.owner,
        entry.remainingTtlSeconds,
      );
    }
  }

  private async incrementRedisPresence(
    redis: IORedis,
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
    updatedAt: string,
  ): Promise<RealtimePresenceStoreResult> {
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
  }

  private async writeRedisTyping(
    redis: IORedis,
    owner: LocalTypingOwner,
    ttlSeconds: number,
  ): Promise<void> {
    const keys = typingKeys(
      owner.schoolId,
      owner.conversationId,
      owner.userId,
    );
    const result = await redis
      .multi()
      .set(keys.user, owner.startedAt, 'EX', ttlSeconds)
      .sadd(keys.users, owner.userId)
      .expire(keys.users, ttlSeconds)
      .exec();
    assertRedisTransaction(result);
  }

  private markRedisUnavailable(redis: IORedis): void {
    const wasOwned = this.redis === redis;
    if (wasOwned) {
      this.redis = undefined;
    }
    this.beginForcedRedisRetirement(redis);
    if (!wasOwned) return;
    this.setFallbackState();
    this.logRedisFallbackWarning();
  }

  private setFallbackState(): void {
    if (this.lifecycleState === 'destroying') return;
    this.removeExpiredLocalTyping();
    this.lifecycleState =
      this.allowLocalFallback && this.hasLocalState()
        ? 'fallback'
        : 'unavailable';
  }

  private localFallbackOrThrow<T>(value: T): T {
    if (this.allowLocalFallback) return value;
    throw new Error('realtime_state_redis_unavailable');
  }

  private canUseRedis(redis: IORedis | null): redis is IORedis {
    return (
      Boolean(redis) &&
      this.lifecycleState === 'ready' &&
      this.redis === redis &&
      redis?.status === 'ready'
    );
  }

  private runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const execution = this.mutationTail.then(operation, operation);
    this.mutationTail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  private runLocalTypingSweep(): Promise<void> {
    if (this.lifecycleState === 'destroying') return Promise.resolve();
    if (this.localTypingSweepPromise) return this.localTypingSweepPromise;

    const execution = this.runSerialized(async () => {
      this.removeExpiredLocalTyping();
      if (
        this.lifecycleState === 'fallback' ||
        this.lifecycleState === 'unavailable'
      ) {
        this.setFallbackState();
      }
    });
    const observed = execution.then(
      () => undefined,
      () => undefined,
    );
    const tracked = observed.finally(() => {
      if (this.localTypingSweepPromise === tracked) {
        this.localTypingSweepPromise = null;
      }
    });
    this.localTypingSweepPromise = tracked;
    return tracked;
  }

  private clearLocalTypingSweepTimer(): void {
    if (this.localTypingSweepTimerCleared) return;
    clearInterval(this.localTypingSweepTimer);
    this.localTypingSweepTimerCleared = true;
  }

  private incrementLocalPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
    updatedAt: string,
  ): RealtimePresenceStoreResult {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedUserId = normalizeStateId(userId, 'userId');
    const normalizedSocketId = normalizeStateId(socketId, 'socketId');
    const school = getOrCreateMap(this.localPresence, normalizedSchoolId);
    const user = getOrCreateMap(school, normalizedUserId);
    const hadSockets = user.size > 0;
    const added = !user.has(normalizedSocketId);
    user.set(normalizedSocketId, {
      schoolId: normalizedSchoolId,
      userId: normalizedUserId,
      socketId: normalizedSocketId,
      updatedAt,
      ttlSeconds,
    });

    return {
      socketCount: user.size,
      updatedAt,
      transitionedOnline: !hadSockets && added,
      transitionedOffline: false,
    };
  }

  private decrementLocalPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    updatedAt: string,
  ): RealtimePresenceStoreResult {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedUserId = normalizeStateId(userId, 'userId');
    const school = this.localPresence.get(normalizedSchoolId);
    const user = school?.get(normalizedUserId);
    const removed = user?.delete(normalizeStateId(socketId, 'socketId'));

    if (user?.size === 0) school?.delete(normalizedUserId);
    if (school?.size === 0) this.localPresence.delete(normalizedSchoolId);

    return {
      socketCount: user?.size ?? 0,
      updatedAt,
      transitionedOnline: false,
      transitionedOffline: Boolean(removed) && (user?.size ?? 0) === 0,
    };
  }

  private refreshLocalPresence(
    schoolId: string,
    userId: string,
    socketId: string,
    ttlSeconds: number,
    updatedAt: string,
  ): LocalPresenceOwner | null {
    const owner = this.findLocalPresenceOwner(schoolId, userId, socketId);
    if (!owner) return null;
    owner.updatedAt = updatedAt;
    owner.ttlSeconds = ttlSeconds;
    return owner;
  }

  private findLocalPresenceOwner(
    schoolId: string,
    userId: string,
    socketId: string,
  ): LocalPresenceOwner | null {
    return (
      this.localPresence
        .get(normalizeStateId(schoolId, 'schoolId'))
        ?.get(normalizeStateId(userId, 'userId'))
        ?.get(normalizeStateId(socketId, 'socketId')) ?? null
    );
  }

  private getLocalPresenceSnapshot(
    schoolId: string,
  ): RealtimePresenceSnapshotItem[] {
    const school = this.localPresence.get(
      normalizeStateId(schoolId, 'schoolId'),
    );
    if (!school) return [];

    return [...school.entries()]
      .filter(([, sockets]) => sockets.size > 0)
      .map(([userId, sockets]) => ({
        userId,
        online: true as const,
        updatedAt: latestPresenceTimestamp(sockets.values()),
      }))
      .sort(compareByUserId);
  }

  private setLocalTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
    startedAt: string,
    expiresAtMs: number,
  ): LocalTypingOwner {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedConversationId = normalizeStateId(
      conversationId,
      'conversationId',
    );
    const normalizedUserId = normalizeStateId(userId, 'userId');
    const conversation = getOrCreateMap(
      getOrCreateMap(this.localTyping, normalizedSchoolId),
      normalizedConversationId,
    );
    const owner = {
      schoolId: normalizedSchoolId,
      conversationId: normalizedConversationId,
      userId: normalizedUserId,
      startedAt,
      expiresAtMs,
    };
    conversation.set(normalizedUserId, owner);
    return owner;
  }

  private clearLocalTyping(
    schoolId: string,
    conversationId: string,
    userId: string,
  ): void {
    const normalizedSchoolId = normalizeStateId(schoolId, 'schoolId');
    const normalizedConversationId = normalizeStateId(
      conversationId,
      'conversationId',
    );
    const school = this.localTyping.get(normalizedSchoolId);
    const conversation = school?.get(normalizedConversationId);
    conversation?.delete(normalizeStateId(userId, 'userId'));
    if (conversation?.size === 0) school?.delete(normalizedConversationId);
    if (school?.size === 0) this.localTyping.delete(normalizedSchoolId);
  }

  private getLocalTypingUsers(
    schoolId: string,
    conversationId: string,
  ): RealtimeTypingUser[] {
    this.removeExpiredLocalTyping();
    const conversation = this.localTyping
      .get(normalizeStateId(schoolId, 'schoolId'))
      ?.get(normalizeStateId(conversationId, 'conversationId'));
    if (!conversation) return [];

    return [...conversation.values()].map(typingUser).sort(compareByUserId);
  }

  private removeExpiredLocalTyping(): void {
    const nowMs = Date.now();
    for (const [schoolId, school] of this.localTyping.entries()) {
      for (const [conversationId, conversation] of school.entries()) {
        for (const [userId, owner] of conversation.entries()) {
          if (owner.expiresAtMs <= nowMs) conversation.delete(userId);
        }
        if (conversation.size === 0) school.delete(conversationId);
      }
      if (school.size === 0) this.localTyping.delete(schoolId);
    }
  }

  private hasLocalState(): boolean {
    return this.localPresence.size > 0 || this.localTyping.size > 0;
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
      const startedAt = results?.[valueIndex]?.[1];
      const ttlSeconds = Number(results?.[valueIndex + 1]?.[1]);
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

  private async destroy(): Promise<void> {
    const activeSweep = this.localTypingSweepPromise;
    if (activeSweep) await activeSweep;
    const recovery = this.recoveryPromise;
    if (recovery) await recovery;
    await this.mutationTail;
    const redis = this.redis;
    this.redis = undefined;
    if (redis) this.closeRedisClient(redis);
    await Promise.all([...this.redisClientRetirements]);
  }

  private beginForcedRedisRetirement(redis?: IORedis): void {
    if (!redis) return;
    const existing = this.redisClientClosePromises.get(redis);
    if (existing) {
      this.disconnectRedisClient(redis);
      return;
    }

    this.trackRedisClientRetirement(
      redis,
      this.forceRetireRedisClientOnce(redis),
    );
  }

  private async forceRetireRedisClientOnce(redis: IORedis): Promise<void> {
    const terminal = observeRedisTerminalClose(
      redis,
      REDIS_STATE_STORE_CLOSE_TIMEOUT_MS,
    );
    this.disconnectRedisClient(redis);
    await terminal;
  }

  private disconnectRedisClient(redis?: IORedis): void {
    if (!redis || this.forceDisconnectedRedisClients.has(redis)) return;
    this.forceDisconnectedRedisClients.add(redis);
    try {
      redis.disconnect();
    } catch {
      // Failed clients are retired synchronously; no raw error is exposed.
    }
  }

  private closeRedisClient(redis?: IORedis): Promise<void> {
    if (!redis) return Promise.resolve();
    const existing = this.redisClientClosePromises.get(redis);
    if (existing) return existing;

    return this.trackRedisClientRetirement(
      redis,
      this.closeRedisClientOnce(redis),
    );
  }

  private trackRedisClientRetirement(
    redis: IORedis,
    execution: Promise<void>,
  ): Promise<void> {
    this.redisClientClosePromises.set(redis, execution);
    this.redisClientRetirements.add(execution);
    const release = (): void => {
      this.redisClientRetirements.delete(execution);
    };
    void execution.then(release, release);
    return execution;
  }

  private async closeRedisClientOnce(redis: IORedis): Promise<void> {
    const terminal = observeRedisTerminalClose(
      redis,
      REDIS_STATE_STORE_CLOSE_TIMEOUT_MS,
    );
    if (
      redis.status === 'ready' ||
      redis.status === 'connect' ||
      redis.status === 'connecting' ||
      redis.status === 'reconnecting'
    ) {
      const result = await settleRedisClose(
        Promise.resolve().then(() => redis.quit()),
        REDIS_STATE_STORE_CLOSE_TIMEOUT_MS,
      );
      if (result !== 'fulfilled') this.disconnectRedisClient(redis);
    } else {
      this.disconnectRedisClient(redis);
    }

    const terminalResult = await terminal;
    if (terminalResult === 'timed_out') this.disconnectRedisClient(redis);
  }

  private logRedisFallbackWarning(): void {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn({
      event: 'realtime.state_store.unavailable',
      stage: this.allowLocalFallback ? 'fallback' : 'dependency',
    });
  }

  private isDestroying(): boolean {
    return this.lifecycleState === 'destroying';
  }

  private assertRecoveryCandidateReady(candidate: IORedis): void {
    if (
      this.isDestroying() ||
      this.redis !== candidate ||
      candidate.status !== 'ready'
    ) {
      throw new Error(REDIS_STATE_RECOVERY_CANDIDATE_INVALID);
    }
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

function assertRedisTransaction(
  result: Array<[Error | null, unknown]> | null,
): void {
  if (!result || result.some(([error]) => error)) {
    throw new Error('realtime_state_transaction_failed');
  }
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

function latestPresenceTimestamp(
  owners: IterableIterator<LocalPresenceOwner>,
): string {
  let latest = new Date(0).toISOString();
  for (const owner of owners) {
    if (owner.updatedAt > latest) latest = owner.updatedAt;
  }
  return latest;
}

function typingUser(owner: LocalTypingOwner): RealtimeTypingUser {
  return {
    userId: owner.userId,
    startedAt: owner.startedAt,
    expiresAt: new Date(owner.expiresAtMs).toISOString(),
  };
}

function createLocalTypingOwner(
  schoolId: string,
  conversationId: string,
  userId: string,
  startedAt: string,
  expiresAtMs: number,
): LocalTypingOwner {
  return {
    schoolId: normalizeStateId(schoolId, 'schoolId'),
    conversationId: normalizeStateId(conversationId, 'conversationId'),
    userId: normalizeStateId(userId, 'userId'),
    startedAt,
    expiresAtMs,
  };
}

function compareByUserId<T extends { userId: string }>(
  left: T,
  right: T,
): number {
  return left.userId.localeCompare(right.userId);
}

type RedisCloseSettlement = 'fulfilled' | 'rejected' | 'timed_out';
type RedisTerminalSettlement = 'closed' | 'timed_out';

function observeRedisTerminalClose(
  redis: IORedis,
  timeoutMs: number,
): Promise<RedisTerminalSettlement> {
  if (redis.status === 'end') return Promise.resolve('closed');

  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const settle = (result: RedisTerminalSettlement): void => {
      if (settled) return;
      settled = true;
      redis.off('close', onClose);
      redis.off('end', onEnd);
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };
    const onClose = (): void => {
      if (redis.status === 'end') settle('closed');
    };
    const onEnd = (): void => settle('closed');

    redis.on('close', onClose);
    redis.once('end', onEnd);
    if (redis.status === 'end') {
      settle('closed');
      return;
    }

    timeout = setTimeout(() => settle('timed_out'), timeoutMs);
    timeout.unref();
  });
}

async function settleRedisClose(
  operation: Promise<unknown>,
  timeoutMs: number,
): Promise<RedisCloseSettlement> {
  let timeout: NodeJS.Timeout | undefined;
  const observed = operation.then<RedisCloseSettlement, RedisCloseSettlement>(
    () => 'fulfilled',
    () => 'rejected',
  );
  const deadline = new Promise<RedisCloseSettlement>((resolve) => {
    timeout = setTimeout(() => resolve('timed_out'), timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([observed, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
