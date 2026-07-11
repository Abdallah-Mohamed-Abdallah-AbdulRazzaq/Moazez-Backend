import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Processor, Queue, RedisConnection, Worker } from 'bullmq';
import IORedis from 'ioredis';

const DEFAULT_REMOVE_ON_COMPLETE = 100;
const DEFAULT_REMOVE_ON_FAIL = 500;
const SHUTDOWN_CONNECTION_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
]);

type RedisConnectionLifecycle = {
  _client?: RedisShutdownClient;
  initializing: Promise<unknown>;
  status: RedisConnection['status'];
};

type RedisShutdownStream = {
  destroyed?: boolean;
  once(event: 'close', listener: () => void): unknown;
};

type RedisShutdownConnector = {
  stream?: RedisShutdownStream;
};

type RedisShutdownClient = {
  connector?: RedisShutdownConnector;
};

/**
 * BullMQ removes RedisConnection listeners during close. If an initializing
 * connection rejects immediately afterward, EventEmitter would otherwise
 * report expected post-close noise as an unhandled error. Keep an error sink
 * only after this connection has entered its own close lifecycle.
 */
class WorkerShutdownRedisConnection extends RedisConnection {
  private retainClosingErrorListener = false;
  private readonly closingErrorListener = (): void => undefined;

  override async close(force = false): Promise<void> {
    this.retainClosingErrorListener = true;
    await super.close(force);
  }

  override removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    if (
      this.retainClosingErrorListener &&
      (event === undefined || event === 'error')
    ) {
      super.on('error', this.closingErrorListener);
    }
    return this;
  }
}

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  private readonly connection: IORedis;
  private readonly sharedStreamSettlement: () => Promise<void>;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly blockingStreamSettlements = new WeakMap<
    Worker,
    () => Promise<void>
  >();
  private readonly workerRuns = new WeakMap<Worker, Promise<void>>();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.connection = new IORedis(
      this.configService.getOrThrow<string>('REDIS_URL'),
      {
        lazyConnect: true,
        maxRetriesPerRequest: null,
      },
    );
    this.sharedStreamSettlement = this.trackRedisClientStreams(
      this.connection as unknown as RedisShutdownClient,
    );
    this.connection.on('error', (error: Error) => {
      if (this.isExpectedSharedConnectionShutdownError(error)) {
        return;
      }

      this.logger.error(
        `BullMQ Redis connection failed: ${error.message}`,
        error.stack,
      );
    });
  }

  getQueue(name: string): Queue {
    const existingQueue = this.queues.get(name);
    if (existingQueue) {
      return existingQueue;
    }

    const queue = new Queue(
      name,
      {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
          removeOnFail: DEFAULT_REMOVE_ON_FAIL,
        },
      },
      WorkerShutdownRedisConnection,
    );

    this.queues.set(name, queue);
    return queue;
  }

  addJob<TData extends object>(
    queueName: string,
    jobName: string,
    data: TData,
    options?: JobsOptions,
  ) {
    return this.getQueue(queueName).add(jobName, data, options);
  }

  async ping(): Promise<void> {
    await this.connection.ping();
  }

  async getQueueReadiness(name: string): Promise<{
    name: string;
    status: 'ok';
    counts: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    };
  }> {
    const queue = this.getQueue(name);
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
    );

    return {
      name,
      status: 'ok',
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  }

  createWorker<TData extends object, TResult = unknown>(
    queueName: string,
    processor: Processor<TData, TResult, string>,
  ): Worker<TData, TResult, string> {
    const worker = new Worker<TData, TResult, string>(
      queueName,
      processor,
      { connection: this.connection, autorun: false },
      WorkerShutdownRedisConnection,
    );

    worker.on('error', (error: Error) => {
      if (this.isExpectedShutdownError(worker, error)) {
        return;
      }

      this.logger.error(
        `BullMQ worker ${queueName} failed: ${error.message}`,
        error.stack,
      );
    });

    this.retainBlockingConnectionErrorSafety(worker);
    this.trackBlockingConnectionStreams(worker);
    this.stopLateStalledCheckOnShutdown(worker);

    this.workers.push(worker as unknown as Worker);
    const run = worker.run().catch((error: Error) => {
      worker.emit('error', error);
    });
    this.workerRuns.set(worker as unknown as Worker, run);
    return worker;
  }

  onModuleDestroy(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.shutdown();
    }

    return this.shutdownPromise;
  }

  private async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await Promise.all(this.workers.map((worker) => this.closeWorker(worker)));

    await Promise.all(
      [...this.queues.values()].map((queue) => this.closeQueue(queue)),
    );

    if (
      this.connection.status === 'ready' ||
      this.connection.status === 'connect' ||
      this.connection.status === 'reconnecting'
    ) {
      await this.connection.quit();
    } else {
      this.connection.disconnect();
    }

    await this.sharedStreamSettlement();
  }

  private async closeQueue(queue: Queue): Promise<void> {
    await queue.close();
    const connection = (
      queue as unknown as { connection: RedisConnectionLifecycle }
    ).connection;
    await this.settleClosedConnection(connection);
  }

  private async closeWorker(worker: Worker): Promise<void> {
    await worker.close();

    const lifecycleConnections = worker as unknown as {
      connection: RedisConnectionLifecycle;
      blockingConnection: RedisConnectionLifecycle;
    };
    await Promise.all([
      this.settleClosedConnection(lifecycleConnections.connection),
      this.settleClosedConnection(lifecycleConnections.blockingConnection),
    ]);
    await this.workerRuns.get(worker);
    await this.blockingStreamSettlements.get(worker)?.();
  }

  private trackBlockingConnectionStreams(worker: Worker): void {
    const blockingConnection = (
      worker as unknown as { blockingConnection: RedisConnectionLifecycle }
    ).blockingConnection;
    this.blockingStreamSettlements.set(
      worker,
      blockingConnection._client
        ? this.trackRedisClientStreams(blockingConnection._client)
        : () => Promise.resolve(),
    );
  }

  private trackRedisClientStreams(
    client: RedisShutdownClient,
  ): () => Promise<void> {
    const observedConnectors = new WeakSet<RedisShutdownConnector>();
    const connectorSettlements: Array<() => Promise<void>> = [];
    const observe = (connector: RedisShutdownConnector | undefined): void => {
      if (connector && !observedConnectors.has(connector)) {
        observedConnectors.add(connector);
        connectorSettlements.push(this.trackConnectorStreams(connector));
      }
    };
    let currentConnector = client.connector;
    observe(currentConnector);

    Object.defineProperty(client, 'connector', {
      configurable: true,
      enumerable: true,
      get: () => currentConnector,
      set: (connector: RedisShutdownConnector | undefined) => {
        currentConnector = connector;
        observe(connector);
      },
    });

    return async () => {
      await Promise.all(
        connectorSettlements.map((settleConnector) => settleConnector()),
      );
    };
  }

  private trackConnectorStreams(
    connector: RedisShutdownConnector | undefined,
  ): () => Promise<void> {
    if (!connector) {
      return () => Promise.resolve();
    }

    const observedStreams = new WeakSet<RedisShutdownStream>();
    const streamSettlements: Promise<void>[] = [];
    const observe = (stream: RedisShutdownStream | undefined): void => {
      if (!stream || stream.destroyed || observedStreams.has(stream)) {
        return;
      }

      observedStreams.add(stream);
      streamSettlements.push(
        new Promise<void>((resolve) => {
          stream.once('close', () => {
            if (this.isShuttingDown && connector.stream === stream) {
              connector.stream = undefined;
            }
            setImmediate(resolve);
          });
        }),
      );
    };
    let currentStream = connector.stream;
    observe(currentStream);

    Object.defineProperty(connector, 'stream', {
      configurable: true,
      enumerable: true,
      get: () => currentStream,
      set: (stream: RedisShutdownStream | undefined) => {
        currentStream = stream;
        observe(stream);
      },
    });

    return async () => {
      await Promise.all(streamSettlements);
    };
  }

  private async settleClosedConnection(
    connection: RedisConnectionLifecycle,
  ): Promise<void> {
    try {
      await connection.initializing;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        connection.status === 'closed' &&
        this.isConnectionClosureError(error)
      ) {
        return;
      }

      throw error;
    }
  }

  private isExpectedShutdownError(worker: Worker, error: Error): boolean {
    if (!this.isShuttingDown) {
      return false;
    }

    return worker.closing !== undefined && this.isConnectionClosureError(error);
  }

  private isExpectedSharedConnectionShutdownError(error: Error): boolean {
    return (
      this.isShuttingDown &&
      this.isConnectionClosureError(error) &&
      (this.connection.status === 'close' ||
        this.connection.status === 'end' ||
        this.workers.every((worker) => worker.closing !== undefined))
    );
  }

  private isConnectionClosureError(error: Error): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return (
      error.message === 'Connection is closed.' ||
      (code !== undefined && SHUTDOWN_CONNECTION_ERROR_CODES.has(code))
    );
  }

  /**
   * Worker creates its blocking RedisConnection internally instead of using
   * the supplied connection class. BullMQ removes that connection's listeners
   * during close even though its initialization rejection can arrive on the
   * next microtask. Retain a per-connection error sink only after that removal;
   * errors outside central shutdown continue to flow through the worker.
   */
  private retainBlockingConnectionErrorSafety(worker: Worker): void {
    const blockingConnection = (
      worker as unknown as { blockingConnection: RedisConnection }
    ).blockingConnection;
    const removeAllListeners = blockingConnection.removeAllListeners.bind(
      blockingConnection,
    ) as unknown as (event?: string | symbol) => RedisConnection;

    blockingConnection.removeAllListeners = (event?: string | symbol) => {
      removeAllListeners(event);
      if (event === undefined || event === 'error') {
        blockingConnection.on('error', (error: Error) => {
          if (
            this.isShuttingDown &&
            (blockingConnection.status === 'closing' ||
              blockingConnection.status === 'closed')
          ) {
            return;
          }

          worker.emit('error', error);
        });
      }
      return blockingConnection;
    };
  }

  /**
   * A stalled-check iteration can finish its Redis call after Worker.close()
   * has already looked for its timer stopper. When BullMQ publishes that late
   * stopper during central shutdown, invoke it immediately so the completed
   * worker does not retain a full stalledInterval timer.
   */
  private stopLateStalledCheckOnShutdown(worker: Worker): void {
    const lifecycle = worker as unknown as {
      stalledCheckStopper: (() => void) | undefined;
    };
    let stalledCheckStopper = lifecycle.stalledCheckStopper;

    Object.defineProperty(worker, 'stalledCheckStopper', {
      configurable: true,
      get: () => stalledCheckStopper,
      set: (stopper: (() => void) | undefined) => {
        stalledCheckStopper = stopper;
        if (worker.closing !== undefined) {
          stopper?.();
        }
      },
    });
  }
}
