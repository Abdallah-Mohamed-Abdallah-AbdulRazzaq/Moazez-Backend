import { Logger, OnModuleDestroy } from '@nestjs/common';
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
import type { Server } from 'socket.io';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../common/context/request-context';
import type { Env } from '../../config/env.validation';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { REALTIME_CLIENT_COMMANDS } from './realtime-event-names';
import { conversationRoom, schoolRoom, userRoom } from './realtime-room-names';
import { RealtimePublisherService } from './realtime-publisher.service';
import type {
  RealtimeAuthenticatedContext,
  RealtimeSocket,
} from './realtime.types';

const REALTIME_NAMESPACE = '/api/v1/realtime';
const REDIS_ADAPTER_CONNECT_TIMEOUT_MS = 1000;

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit<Server>,
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>,
    OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private redisPublisher?: IORedis;
  private redisSubscriber?: IORedis;

  constructor(
    private readonly authService: RealtimeAuthService,
    private readonly communicationAccessService: RealtimeCommunicationAccessService,
    private readonly publisher: RealtimePublisherService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async afterInit(server: Server): Promise<void> {
    this.server = server;
    this.publisher.bindServer(server);
    await this.configureRedisAdapter(server);
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const context = createRequestContext(this.extractRequestId(client));

    try {
      await runWithRequestContext(context, async () => {
        const authenticated = await this.authService.authenticate(client);
        Object.assign(client.data, authenticated);

        await client.join([
          schoolRoom(authenticated.schoolId),
          userRoom(authenticated.schoolId, authenticated.actorId),
        ]);
      });
    } catch (error) {
      this.logger.warn(
        `Rejected realtime socket ${client.id}: ${this.getErrorCode(error)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: RealtimeSocket): void {
    if (!client.data.actorId) return;

    this.logger.debug(
      `Realtime socket disconnected for actor ${client.data.actorId}`,
    );
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

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.closeRedisClient(this.redisPublisher),
      this.closeRedisClient(this.redisSubscriber),
    ]);
  }

  private async configureRedisAdapter(server: Server): Promise<void> {
    const redisUrl = this.configService.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      this.logger.warn(
        'Realtime Redis adapter unavailable; REDIS_URL is not configured.',
      );
      return;
    }

    const publisher = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: REDIS_ADAPTER_CONNECT_TIMEOUT_MS,
      retryStrategy: () => null,
    });
    const subscriber = publisher.duplicate();

    let warningLogged = false;
    const logRedisError = (): void => {
      if (warningLogged) return;
      warningLogged = true;
      this.logger.warn(
        'Realtime Redis adapter unavailable; using in-memory Socket.io adapter.',
      );
    };

    publisher.on('error', logRedisError);
    subscriber.on('error', logRedisError);

    try {
      await this.connectRedisClients(publisher, subscriber);
      server.adapter(createAdapter(publisher, subscriber));
      this.redisPublisher = publisher;
      this.redisSubscriber = subscriber;
      this.logger.log('Realtime Redis adapter connected');
    } catch {
      logRedisError();
      publisher.disconnect();
      subscriber.disconnect();
    }
  }

  private async connectRedisClients(
    publisher: IORedis,
    subscriber: IORedis,
  ): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        Promise.all([publisher.connect(), subscriber.connect()]).then(
          () => undefined,
        ),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('Realtime Redis adapter connection timed out')),
            REDIS_ADAPTER_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async closeRedisClient(client?: IORedis): Promise<void> {
    if (!client) return;

    if (
      client.status === 'ready' ||
      client.status === 'connect' ||
      client.status === 'connecting' ||
      client.status === 'reconnecting'
    ) {
      try {
        await client.quit();
        return;
      } catch {
        client.disconnect();
        return;
      }
    }

    client.disconnect();
  }

  private extractRequestId(client: RealtimeSocket): string | undefined {
    const requestId = client.handshake.headers['x-request-id'];
    const value = Array.isArray(requestId) ? requestId[0] : requestId;

    return value && value.trim().length > 0 ? value : undefined;
  }

  private runWithSocketContext<T>(
    client: RealtimeSocket,
    fn: (context: RealtimeAuthenticatedContext) => Promise<T>,
  ): Promise<T> {
    const context = this.requireAuthenticatedSocket(client);
    const requestContext = createRequestContext(this.extractRequestId(client));

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
    });
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

  private getErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String((error as { code: unknown }).code);
    }

    return 'realtime.auth.failed';
  }
}

export { REALTIME_NAMESPACE };
