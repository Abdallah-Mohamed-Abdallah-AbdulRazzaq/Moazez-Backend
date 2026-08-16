import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { Namespace, Server } from 'socket.io';
import { Adapter } from 'socket.io-adapter';
import { applicationCorsOriginDelegate } from '../../bootstrap/application-cors.policy';
import { ApplicationLifecycleState } from '../../bootstrap/application-lifecycle.state';
import { REQUEST_ID_HEADER } from '../../common/context/correlation-id';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../common/context/request-context';
import type { Env } from '../../config/env.validation';
import {
  createRedisClientOptions,
  resolveRedisConnectionConfiguration,
  type RedisConnectionConfiguration,
} from '../../config/redis-connection.options';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { REALTIME_NAMESPACE } from './realtime-contract';
import { REALTIME_CLIENT_COMMANDS } from './realtime-event-names';
import { RealtimePresenceService } from './realtime-presence.service';
import { conversationRoom, schoolRoom, userRoom } from './realtime-room-names';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeTypingService } from './realtime-typing.service';
import type {
  RealtimeAuthenticatedContext,
  RealtimeSocket,
} from './realtime.types';

const REDIS_ADAPTER_CONNECT_TIMEOUT_MS = 400;
const REDIS_ADAPTER_COMMAND_TIMEOUT_MS = 400;
const REDIS_ADAPTER_OPERATION_TIMEOUT_MS = 600;
const REDIS_ADAPTER_CLOSE_TIMEOUT_MS = 400;

export type RealtimeAdapterLifecycleState =
  | 'initializing'
  | 'ready'
  | 'recovering'
  | 'unavailable'
  | 'destroying';

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: {
    origin: applicationCorsOriginDelegate,
    credentials: true,
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit<Server | Namespace>,
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>,
    OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server | Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);
  private redisPublisher?: IORedis;
  private redisSubscriber?: IORedis;
  private redisAdapterReadinessPromise: Promise<boolean> | null = null;
  private redisAdapterPingFlight: {
    publisher: IORedis;
    subscriber: IORedis;
    outcome: Promise<boolean>;
  } | null = null;
  private readonly redisClientClosePromises = new WeakMap<
    IORedis,
    Promise<void>
  >();
  private readonly forceDisconnectedRedisClients = new WeakSet<IORedis>();
  private adapterLifecycleState: RealtimeAdapterLifecycleState = 'initializing';
  private adapterGeneration = 0;
  private destroyPromise: Promise<void> | null = null;
  private socketDisconnectPromise: Promise<void> | null = null;
  private readonly presenceCleanup = new Set<Promise<void>>();

  constructor(
    private readonly authService: RealtimeAuthService,
    private readonly communicationAccessService: RealtimeCommunicationAccessService,
    private readonly publisher: RealtimePublisherService,
    private readonly configService: ConfigService<Env, true>,
    private readonly presenceService: RealtimePresenceService,
    private readonly typingService: RealtimeTypingService,
    @Optional()
    private readonly lifecycle: ApplicationLifecycleState = new ApplicationLifecycleState(),
  ) {}

  async afterInit(server: Server | Namespace): Promise<void> {
    this.server = server;
    this.publisher.bindServer(server);
    server.use((_socket, next) => {
      if (this.lifecycle.isDraining()) {
        next(new Error('realtime.shutdown'));
        return;
      }
      if (this.adapterLifecycleState !== 'ready') {
        next(new Error('realtime.unavailable'));
        return;
      }
      next();
    });
    await Promise.resolve();
    await this.ensureRedisAdapterReady();
  }

  async checkReadiness(): Promise<void> {
    if (this.lifecycle.isDraining()) {
      throw new Error('realtime_draining');
    }

    const publisher = this.redisPublisher;
    const subscriber = this.redisSubscriber;
    if (
      this.adapterLifecycleState === 'ready' &&
      publisher?.status === 'ready' &&
      subscriber?.status === 'ready'
    ) {
      try {
        await this.pingRedisAdapterClients();
        return;
      } catch {
        this.markAdapterUnavailable(publisher, subscriber);
        void this.ensureRedisAdapterReady();
        throw new Error('realtime_redis_unavailable');
      }
    }

    if (this.adapterLifecycleState === 'ready') {
      this.markAdapterUnavailable(publisher, subscriber);
    }

    if (!(await this.ensureRedisAdapterReady())) {
      throw new Error('realtime_redis_unavailable');
    }
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    if (!this.canAdmitSockets()) {
      client.disconnect(true);
      return;
    }
    const lease = this.lifecycle.tryAdmit('websocket');
    if (!lease) {
      client.disconnect(true);
      return;
    }
    const context = createRequestContext(
      client.handshake.headers[REQUEST_ID_HEADER],
    );
    const admissionGeneration = this.adapterGeneration;

    try {
      await runWithRequestContext(context, async () => {
        const authenticated = await this.authService.authenticate(client);
        if (
          !this.canAdmitSockets() ||
          admissionGeneration !== this.adapterGeneration
        ) {
          throw new WsException({ code: 'service.unavailable' });
        }
        Object.assign(client.data, authenticated, {
          requestId: context.requestId,
        });

        await client.join([
          schoolRoom(authenticated.schoolId),
          userRoom(authenticated.schoolId, authenticated.actorId),
        ]);

        if (await this.communicationAccessService.isOnlinePresenceEnabled()) {
          await this.presenceService.registerSocket({
            schoolId: authenticated.schoolId,
            userId: authenticated.actorId,
            socketId: client.id,
            actor: authenticated.actor,
          });
        }
      });
    } catch {
      this.logger.warn({
        event: 'realtime.connection.rejected',
        stage: 'admission',
      });
      client.disconnect(true);
    } finally {
      lease.release();
    }
  }

  async handleDisconnect(client: RealtimeSocket): Promise<void> {
    const cleanup = this.cleanupDisconnectedSocket(client);
    this.presenceCleanup.add(cleanup);
    try {
      await cleanup;
    } finally {
      this.presenceCleanup.delete(cleanup);
    }
  }

  disconnectSocketsForShutdown(): Promise<void> {
    this.adapterLifecycleState = 'destroying';
    if (!this.socketDisconnectPromise) {
      this.socketDisconnectPromise = this.disconnectSocketsForDestroy();
    }
    return this.socketDisconnectPromise;
  }

  onModuleDestroy(): Promise<void> {
    if (!this.destroyPromise) {
      this.destroyPromise = this.destroy();
    }
    return this.destroyPromise;
  }

  private async cleanupDisconnectedSocket(
    client: RealtimeSocket,
  ): Promise<void> {
    const presenceInput = this.extractPresenceInput(client);
    if (!presenceInput) return;

    this.logger.debug('Realtime socket disconnected');

    try {
      await this.presenceService.unregisterSocket(presenceInput);
    } catch {
      this.logger.warn({
        event: 'realtime.presence.cleanup_failed',
        stage: 'disconnect',
      });
    }
  }

  private disconnectSockets(): Promise<void> {
    return this.disconnectLocalSockets();
  }

  @SubscribeMessage(
    REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_JOIN,
  )
  async handleConversationJoin(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true }> {
    return this.runWithSocketContext(client, async (context) => {
      const conversationId = this.extractConversationId(payload);
      const hasAccess =
        await this.communicationAccessService.canJoinConversationRoom({
          conversationId,
          actorId: context.actorId,
          permissions: context.permissions,
        });

      if (!hasAccess) {
        throw new WsException({
          code: 'communication.conversation.not_member',
        });
      }

      await client.join(conversationRoom(context.schoolId, conversationId));
      return { ok: true };
    });
  }

  @SubscribeMessage(
    REALTIME_CLIENT_COMMANDS.COMMUNICATION_CHAT_CONVERSATION_LEAVE,
  )
  async handleConversationLeave(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true }> {
    return this.runWithSocketContext(client, async (context) => {
      const conversationId = this.extractConversationId(payload);

      await client.leave(conversationRoom(context.schoolId, conversationId));
      return { ok: true };
    });
  }

  @SubscribeMessage(REALTIME_CLIENT_COMMANDS.COMMUNICATION_TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true }> {
    return this.runWithSocketContext(client, async (context) => {
      const conversationId = this.extractConversationId(payload);

      await this.typingService.startTyping({
        schoolId: context.schoolId,
        conversationId,
        userId: context.actorId,
        permissions: context.permissions,
        actor: context.actor,
      });

      return { ok: true };
    });
  }

  @SubscribeMessage(REALTIME_CLIENT_COMMANDS.COMMUNICATION_TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true }> {
    return this.runWithSocketContext(client, async (context) => {
      const conversationId = this.extractConversationId(payload);

      await this.typingService.stopTyping({
        schoolId: context.schoolId,
        conversationId,
        userId: context.actorId,
        permissions: context.permissions,
        actor: context.actor,
      });

      return { ok: true };
    });
  }

  private async destroy(): Promise<void> {
    await this.disconnectSocketsForShutdown();
    if (this.server) {
      installSocketAdapter(this.server, Adapter);
    }
    await Promise.all([
      this.closeRedisClient(this.redisPublisher),
      this.closeRedisClient(this.redisSubscriber),
    ]);
    this.redisPublisher = undefined;
    this.redisSubscriber = undefined;
  }

  private ensureRedisAdapterReady(): Promise<boolean> {
    if (this.adapterLifecycleState === 'destroying') {
      return Promise.resolve(false);
    }
    if (
      this.adapterLifecycleState === 'ready' &&
      this.redisPublisher?.status === 'ready' &&
      this.redisSubscriber?.status === 'ready'
    ) {
      return Promise.resolve(true);
    }

    if (this.redisAdapterReadinessPromise) {
      return this.redisAdapterReadinessPromise;
    }

    this.adapterLifecycleState = 'recovering';
    this.adapterGeneration += 1;
    const execution = this.configureRedisAdapter(this.server).finally(() => {
      if (this.redisAdapterReadinessPromise === execution) {
        this.redisAdapterReadinessPromise = null;
      }
      if (
        this.adapterLifecycleState !== 'ready' &&
        this.adapterLifecycleState !== 'destroying'
      ) {
        this.adapterLifecycleState = 'unavailable';
      }
    });
    this.redisAdapterReadinessPromise = execution;
    return execution;
  }

  private async pingRedisAdapterClients(): Promise<void> {
    const publisher = this.redisPublisher;
    const subscriber = this.redisSubscriber;
    if (!publisher || !subscriber) {
      throw new Error('realtime_redis_unavailable');
    }

    const flight = this.getRedisAdapterPingFlight(publisher, subscriber);
    const bounded = await settleWithin(
      flight.outcome,
      REDIS_ADAPTER_OPERATION_TIMEOUT_MS,
    );
    if (bounded.status !== 'fulfilled' || !bounded.value) {
      throw new Error('realtime_redis_unavailable');
    }
  }

  private getRedisAdapterPingFlight(
    publisher: IORedis,
    subscriber: IORedis,
  ): { publisher: IORedis; subscriber: IORedis; outcome: Promise<boolean> } {
    const existing = this.redisAdapterPingFlight;
    if (
      existing &&
      existing.publisher === publisher &&
      existing.subscriber === subscriber
    ) {
      return existing;
    }

    const childSettlements = Promise.allSettled([
      Promise.resolve().then(() => publisher.ping()),
      Promise.resolve().then(() => subscriber.ping()),
    ]);
    const outcome = childSettlements.then((settlements) =>
      settlements.every((settlement) => settlement.status === 'fulfilled'),
    );
    const flight = { publisher, subscriber, outcome };
    this.redisAdapterPingFlight = flight;
    void outcome.finally(() => {
      if (this.redisAdapterPingFlight === flight) {
        this.redisAdapterPingFlight = null;
      }
    });
    return flight;
  }

  private async configureRedisAdapter(
    server: Server | Namespace,
  ): Promise<boolean> {
    let redisConnection: RedisConnectionConfiguration | null;
    try {
      redisConnection = resolveRedisConnectionConfiguration(
        this.configService,
        'realtime',
      );
    } catch {
      this.logger.warn({
        event: 'realtime.redis_adapter.unavailable',
        stage: 'configuration',
      });
      return false;
    }
    if (!redisConnection) {
      this.logger.warn({
        event: 'realtime.redis_adapter.unavailable',
        stage: 'configuration',
      });
      return false;
    }

    await this.disconnectSocketsForAdapterReplacement();
    if (this.adapterLifecycleState === 'destroying') return false;

    const previousPublisher = this.redisPublisher;
    const previousSubscriber = this.redisSubscriber;
    const publisher = new IORedis(
      redisConnection.url,
      createRedisClientOptions(redisConnection, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        connectTimeout: REDIS_ADAPTER_CONNECT_TIMEOUT_MS,
        commandTimeout: REDIS_ADAPTER_COMMAND_TIMEOUT_MS,
        retryStrategy: () => null,
      }),
    );
    const subscriber = publisher.duplicate(
      createRedisClientOptions(redisConnection, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        connectTimeout: REDIS_ADAPTER_CONNECT_TIMEOUT_MS,
        commandTimeout: REDIS_ADAPTER_COMMAND_TIMEOUT_MS,
        retryStrategy: () => null,
      }),
    );

    let warningLogged = false;
    const logRedisError = (): void => {
      if (warningLogged) return;
      warningLogged = true;
      this.logger.warn({
        event: 'realtime.redis_adapter.unavailable',
        stage: 'connection',
      });
    };

    publisher.on('error', logRedisError);
    subscriber.on('error', logRedisError);

    let failureStage:
      | 'connect'
      | 'verification'
      | 'adapter'
      | 'replacement_cleanup' = 'connect';
    try {
      await this.connectRedisClients(publisher, subscriber);
      failureStage = 'verification';
      await this.verifyRedisAdapterCandidate(publisher, subscriber);
      if (
        this.lifecycle.isDraining() ||
        this.isAdapterDestroying()
      ) {
        await Promise.all([
          this.closeRedisClient(publisher),
          this.closeRedisClient(subscriber),
        ]);
        return false;
      }
      failureStage = 'adapter';
      installRedisAdapter(server, publisher, subscriber);
      this.redisPublisher = publisher;
      this.redisSubscriber = subscriber;
      failureStage = 'replacement_cleanup';
      await Promise.all([
        this.closeRedisClient(previousPublisher),
        this.closeRedisClient(previousSubscriber),
      ]);
      if (this.isAdapterDestroying()) {
        installSocketAdapter(server, Adapter);
        await Promise.all([
          this.closeRedisClient(publisher),
          this.closeRedisClient(subscriber),
        ]);
        this.redisPublisher = undefined;
        this.redisSubscriber = undefined;
        return false;
      }
      this.adapterLifecycleState = 'ready';
      this.logger.log('Realtime Redis adapter connected');
      return true;
    } catch {
      logRedisError();
      this.logger.warn({
        event: 'realtime.redis_adapter.unavailable',
        stage: failureStage,
      });
      installSocketAdapter(server, Adapter);
      await Promise.all([
        this.closeRedisClient(publisher),
        this.closeRedisClient(subscriber),
        this.closeRedisClient(previousPublisher),
        this.closeRedisClient(previousSubscriber),
      ]);
      this.redisPublisher = undefined;
      this.redisSubscriber = undefined;
      return false;
    }
  }

  private async connectRedisClients(
    publisher: IORedis,
    subscriber: IORedis,
  ): Promise<void> {
    const childSettlements = Promise.allSettled([
      Promise.resolve().then(() => publisher.connect()),
      Promise.resolve().then(() => subscriber.connect()),
    ]);
    const bounded = await settleWithin(
      childSettlements,
      REDIS_ADAPTER_CONNECT_TIMEOUT_MS,
    );
    if (
      bounded.status !== 'fulfilled' ||
      bounded.value.some((settlement) => settlement.status === 'rejected')
    ) {
      throw new Error('realtime_redis_adapter_connect_failed');
    }
  }

  private async verifyRedisAdapterCandidate(
    publisher: IORedis,
    subscriber: IORedis,
  ): Promise<void> {
    const childSettlements = Promise.allSettled([
      Promise.resolve().then(() => publisher.ping()),
      Promise.resolve().then(() => subscriber.ping()),
    ]);
    const bounded = await settleWithin(
      childSettlements,
      REDIS_ADAPTER_OPERATION_TIMEOUT_MS,
    );
    if (
      bounded.status !== 'fulfilled' ||
      bounded.value.some((settlement) => settlement.status === 'rejected')
    ) {
      throw new Error('realtime_redis_adapter_verification_failed');
    }
  }

  private disconnectSocketsForAdapterReplacement(): Promise<void> {
    return this.disconnectLocalSockets();
  }

  private async disconnectLocalSockets(): Promise<void> {
    if (!this.server) return;

    const sockets = [...this.getNamespace().sockets.values()];
    const disconnects = sockets.map(
      (socket) =>
        new Promise<void>((resolve) => {
          if (!socket.connected) {
            resolve();
            return;
          }
          socket.once('disconnect', () => resolve());
          socket.disconnect(true);
        }),
    );
    await Promise.all(disconnects);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.all([...this.presenceCleanup]);
  }

  private async disconnectSocketsForDestroy(): Promise<void> {
    const recovery = this.redisAdapterReadinessPromise;
    if (recovery) await recovery;
    await this.disconnectSockets();
  }

  private forceDisconnectRedisClient(client?: IORedis): void {
    if (!client || this.forceDisconnectedRedisClients.has(client)) return;
    this.forceDisconnectedRedisClients.add(client);
    try {
      client.disconnect();
    } catch {
      // Failed adapter clients are retired synchronously and exactly once.
    }
  }

  private closeRedisClient(client?: IORedis): Promise<void> {
    if (!client) return Promise.resolve();
    const existing = this.redisClientClosePromises.get(client);
    if (existing) return existing;

    const execution = this.closeRedisClientOnce(client);
    this.redisClientClosePromises.set(client, execution);
    return execution;
  }

  private async closeRedisClientOnce(client: IORedis): Promise<void> {
    if (
      client.status === 'ready' ||
      client.status === 'connect' ||
      client.status === 'connecting' ||
      client.status === 'reconnecting'
    ) {
      const bounded = await settleWithin(
        Promise.resolve().then(() => client.quit()),
        REDIS_ADAPTER_CLOSE_TIMEOUT_MS,
      );
      if (bounded.status === 'fulfilled') {
        return;
      }
      this.forceDisconnectRedisClient(client);
      return;
    }

    this.forceDisconnectRedisClient(client);
  }

  private runWithSocketContext<T>(
    client: RealtimeSocket,
    fn: (context: RealtimeAuthenticatedContext) => Promise<T>,
  ): Promise<T> {
    if (!this.canAdmitSockets()) {
      throw new WsException({ code: 'service.unavailable' });
    }
    const lease = this.lifecycle.tryAdmit('websocket');
    if (!lease) {
      throw new WsException({ code: 'service.unavailable' });
    }

    try {
      const context = this.requireAuthenticatedSocket(client);
      const requestContext = createRequestContext(client.data.requestId);

      return runWithRequestContext(requestContext, async () => {
        setActor({
          id: context.actorId,
          userType: context.userType,
        });
        setActiveMembership({
          membershipId: context.membershipId,
          schoolId: context.schoolId,
          organizationId: context.organizationId,
          roleId: context.roleId,
          permissions: context.permissions,
        });

        return fn(context);
      }).finally(() => lease.release());
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  private requireAuthenticatedSocket(
    client: RealtimeSocket,
  ): RealtimeAuthenticatedContext {
    const data = client.data;
    if (
      !data.actorId ||
      !data.userType ||
      !data.membershipId ||
      !data.schoolId ||
      !data.organizationId ||
      !data.roleId ||
      !data.sessionId ||
      !data.actor ||
      !Array.isArray(data.permissions)
    ) {
      throw new WsException({ code: 'realtime.auth.required' });
    }

    return {
      actorId: data.actorId,
      userType: data.userType,
      membershipId: data.membershipId,
      schoolId: data.schoolId,
      organizationId: data.organizationId,
      roleId: data.roleId,
      permissions: data.permissions,
      sessionId: data.sessionId,
      actor: data.actor,
    };
  }

  private extractConversationId(payload: unknown): string {
    const conversationId =
      payload && typeof payload === 'object'
        ? (payload as { conversationId?: unknown }).conversationId
        : null;

    if (typeof conversationId !== 'string') {
      throw new WsException({ code: 'validation.failed' });
    }

    const normalized = conversationId.trim();
    if (!normalized) {
      throw new WsException({ code: 'validation.failed' });
    }

    return normalized;
  }

  private extractPresenceInput(client: RealtimeSocket): {
    schoolId: string;
    userId: string;
    socketId: string;
    actor: RealtimeAuthenticatedContext['actor'];
  } | null {
    const schoolId = this.normalizeOptionalId(client.data.schoolId);
    const userId = this.normalizeOptionalId(client.data.actorId);
    const socketId = this.normalizeOptionalId(client.id);
    const actor = client.data.actor;

    if (!schoolId || !userId || !socketId || !actor) return null;

    return { schoolId, userId, socketId, actor };
  }

  private normalizeOptionalId(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private canAdmitSockets(): boolean {
    return (
      (!this.server || this.adapterLifecycleState === 'ready') &&
      !this.lifecycle.isDraining()
    );
  }

  private markAdapterUnavailable(
    publisher = this.redisPublisher,
    subscriber = this.redisSubscriber,
  ): void {
    if (this.adapterLifecycleState === 'destroying') return;

    this.adapterLifecycleState = 'unavailable';
    if (this.redisPublisher === publisher) this.redisPublisher = undefined;
    if (this.redisSubscriber === subscriber) this.redisSubscriber = undefined;
    this.forceDisconnectRedisClient(publisher);
    this.forceDisconnectRedisClient(subscriber);
  }

  private getNamespace(): Namespace {
    return 'server' in this.server ? this.server : this.server.sockets;
  }

  private isAdapterDestroying(): boolean {
    return this.adapterLifecycleState === 'destroying';
  }
}

function installRedisAdapter(
  target: Server | Namespace,
  publisher: IORedis,
  subscriber: IORedis,
): void {
  installSocketAdapter(target, createAdapter(publisher, subscriber));
}

function installSocketAdapter(
  target: Server | Namespace,
  adapter: typeof Adapter | ((namespace: Namespace) => Adapter),
): void {
  if ('server' in target) {
    target.server.adapter(adapter);
    return;
  }
  target.adapter(adapter);
}

export { REALTIME_NAMESPACE } from './realtime-contract';

type BoundedSettlement<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected' }
  | { status: 'timed_out' };

async function settleWithin<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<BoundedSettlement<T>> {
  let timeout: NodeJS.Timeout | undefined;
  const observed = operation.then<BoundedSettlement<T>, BoundedSettlement<T>>(
    (value) => ({ status: 'fulfilled', value }),
    () => ({ status: 'rejected' }),
  );
  const deadline = new Promise<BoundedSettlement<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ status: 'timed_out' }), timeoutMs);
  });

  try {
    return await Promise.race([observed, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
