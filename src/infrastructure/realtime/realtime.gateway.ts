import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { Server } from 'socket.io';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../common/context/request-context';
import type { Env } from '../../config/env.validation';
import { RealtimeAuthService } from './realtime-auth.service';
import { schoolRoom, userRoom } from './realtime-room-names';
import { RealtimePublisherService } from './realtime-publisher.service';
import type { RealtimeSocket } from './realtime.types';

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

  private getErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String((error as { code: unknown }).code);
    }

    return 'realtime.auth.failed';
  }
}

export { REALTIME_NAMESPACE };
