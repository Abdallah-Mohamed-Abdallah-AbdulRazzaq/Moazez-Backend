import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Processor, Queue, RedisConnection, Worker } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import { randomUUID } from 'node:crypto';

const DEFAULT_REMOVE_ON_COMPLETE = 100;
const DEFAULT_REMOVE_ON_FAIL = 500;
const BULLMQ_READINESS_CONNECT_TIMEOUT_MS = 400;
const BULLMQ_READINESS_COMMAND_TIMEOUT_MS = 400;
const BULLMQ_READINESS_OPERATION_TIMEOUT_MS = 600;
const BULLMQ_READINESS_CLOSE_TIMEOUT_MS = 400;
const BULLMQ_COMMAND_CONNECT_TIMEOUT_MS = 500;
const BULLMQ_COMMAND_TIMEOUT_MS = 750;
const BULLMQ_RECONNECT_DELAY_MAX_MS = 1000;
const FINISHED_JOB_REPLACEMENT_LOCK_MS = 30_000;
const FINISHED_JOB_STATES = new Set(['completed', 'failed']);
const RELEASE_OWNED_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;
const SHUTDOWN_CONNECTION_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
]);
const QUEUE_AVAILABILITY_ERROR_CODES = new Set([
  ...SHUTDOWN_CONNECTION_ERROR_CODES,
  'ETIMEDOUT',
]);
const QUEUE_AVAILABILITY_ERROR_MESSAGES = [
  'command timed out',
  'connection is closed',
  'enableofflinequeue options is false',
  'max retries per request',
  'read only',
  'socket closed unexpectedly',
];

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

type BoundedSettlement = 'fulfilled' | 'rejected' | 'timed_out';
type QueueReadinessCloseMode = 'force' | 'graceful';

export interface BullmqRepeatRegistration {
  queueName: string;
  jobName: string;
  jobId: string;
  pattern?: string;
  every?: number;
}

export type PersistedTruthJobEnsureResult =
  | 'created'
  | 'replaced'
  | 'preserved'
  | 'not_required'
  | 'replacement_contended';

interface DesiredRepeatRegistration<TData extends object = object> {
  registration: BullmqRepeatRegistration;
  data: TData;
  options: JobsOptions & {
    jobId: string;
    repeat: NonNullable<JobsOptions['repeat']>;
  };
}

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

class BullmqCommandRedisClient extends IORedis {
  constructor(private readonly queueRedisUrl: string) {
    super(queueRedisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: BULLMQ_COMMAND_CONNECT_TIMEOUT_MS,
      commandTimeout: BULLMQ_COMMAND_TIMEOUT_MS,
      retryStrategy: queueRedisReconnectDelay,
    });
  }

  override duplicate(override: Partial<RedisOptions> = {}): IORedis {
    return new IORedis(this.queueRedisUrl, {
      ...override,
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: BULLMQ_COMMAND_CONNECT_TIMEOUT_MS,
      commandTimeout: BULLMQ_COMMAND_TIMEOUT_MS,
      retryStrategy: queueRedisReconnectDelay,
    });
  }
}

class BullmqWorkerRedisClient extends IORedis {
  constructor(private readonly queueRedisUrl: string) {
    super(queueRedisUrl, {
      lazyConnect: true,
      enableOfflineQueue: true,
      autoResendUnfulfilledCommands: true,
      maxRetriesPerRequest: null,
      connectTimeout: BULLMQ_COMMAND_CONNECT_TIMEOUT_MS,
      retryStrategy: queueRedisReconnectDelay,
    });
  }

  override duplicate(override: Partial<RedisOptions> = {}): IORedis {
    return new IORedis(this.queueRedisUrl, {
      ...override,
      lazyConnect: true,
      enableOfflineQueue: true,
      autoResendUnfulfilledCommands: true,
      maxRetriesPerRequest: null,
      connectTimeout: BULLMQ_COMMAND_CONNECT_TIMEOUT_MS,
      retryStrategy: queueRedisReconnectDelay,
    });
  }
}

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  private readonly redisUrl: string;
  private readonly connection: IORedis;
  private readonly sharedStreamSettlement: () => Promise<void>;
  private workerConnection?: IORedis;
  private workerStreamSettlement?: () => Promise<void>;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly repeatRegistrations = new Map<
    string,
    BullmqRepeatRegistration
  >();
  private readonly desiredRepeatRegistrations = new Map<
    string,
    DesiredRepeatRegistration
  >();
  private repeatRestorationFlight: Promise<void> | null = null;
  private readonly blockingStreamSettlements = new WeakMap<
    Worker,
    () => Promise<void>
  >();
  private readonly workerRuns = new WeakMap<Worker, Promise<void>>();
  private readonly workerRunAvailable = new WeakMap<Worker, boolean>();
  private readonly workerRuntimeWarnings = new WeakSet<Worker>();
  private queueReadinessClient?: IORedis;
  private queueReadinessFlight: Promise<void> | null = null;
  private readonly queueReadinessClosePromises = new WeakMap<
    IORedis,
    Promise<void>
  >();
  private readonly disconnectedQueueReadinessClients = new WeakSet<IORedis>();
  private commandConnectionFlight: Promise<void> | null = null;
  private queueReadinessWarningEmitted = false;
  private queueConnectionWarningEmitted = false;
  private workerConnectionWarningEmitted = false;
  private isShuttingDown = false;
  private workerDrainPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.getOrThrow<string>('QUEUE_REDIS_URL');
    this.connection = new BullmqCommandRedisClient(this.redisUrl);
    this.sharedStreamSettlement = this.trackRedisClientStreams(
      this.connection as unknown as RedisShutdownClient,
    );
    this.connection.on('error', (error: Error) => {
      if (this.isExpectedSharedConnectionShutdownError(error)) {
        return;
      }

      if (!this.queueConnectionWarningEmitted) {
        this.queueConnectionWarningEmitted = true;
        this.logger.error({
          event: 'bullmq.redis.unavailable',
          stage: 'connection',
        });
      }
    });
    this.connection.on('close', () => {
      this.repeatRegistrations.clear();
    });
    this.connection.on('reconnecting', () => {
      this.repeatRegistrations.clear();
    });
    this.connection.on('ready', () => {
      this.queueConnectionWarningEmitted = false;
      if (this.isShuttingDown || this.desiredRepeatRegistrations.size === 0) {
        return;
      }

      void this.restoreDesiredRepeatRegistrations().catch(() => {
        if (!this.isShuttingDown) {
          this.logger.error({
            event: 'bullmq.repeat.restore_failed',
            stage: 'redis_ready',
          });
        }
      });
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
        skipWaitingForReady: true,
        defaultJobOptions: {
          removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
          removeOnFail: DEFAULT_REMOVE_ON_FAIL,
        },
      },
      WorkerShutdownRedisConnection,
    );
    (
      queue as unknown as {
        on?: (event: 'error', listener: (error: Error) => void) => unknown;
      }
    ).on?.('error', () => undefined);

    this.queues.set(name, queue);
    return queue;
  }

  async addJob<TData extends object>(
    queueName: string,
    jobName: string,
    data: TData,
    options?: JobsOptions,
  ) {
    await this.ensureCommandConnectionReady();
    try {
      const job = await this.getQueue(queueName).add(jobName, data, options);
      this.queueConnectionWarningEmitted = false;
      return job;
    } catch (error) {
      this.rethrowSanitizedQueueCommandError(error);
    }
  }

  async ensureJobFromPersistedTruth<TData extends object>(
    queueName: string,
    jobName: string,
    data: TData,
    options: JobsOptions & { jobId: string },
    workStillRequired = true,
  ): Promise<PersistedTruthJobEnsureResult> {
    if (!options.jobId || options.jobId.trim().length === 0) {
      throw new Error('queue_recovery_job_id_required');
    }
    if (!workStillRequired) return 'not_required';

    await this.ensureCommandConnectionReady();
    const queue = this.getQueue(queueName);

    try {
      const existing = await queue.getJob(options.jobId);
      if (!existing) {
        await queue.add(jobName, data, options);
        this.queueConnectionWarningEmitted = false;
        return 'created';
      }

      const state = await existing.getState();
      if (!FINISHED_JOB_STATES.has(state)) return 'preserved';

      const client = await queue.client;
      const lockKey = queue.toKey(
        `persisted-truth-replacement:${options.jobId}`,
      );
      const lockToken = randomUUID();
      const acquired = await client.set(
        lockKey,
        lockToken,
        'PX',
        FINISHED_JOB_REPLACEMENT_LOCK_MS,
        'NX',
      );
      if (acquired !== 'OK') return 'replacement_contended';

      try {
        const current = await queue.getJob(options.jobId);
        if (current) {
          const currentState = await current.getState();
          if (!FINISHED_JOB_STATES.has(currentState)) return 'preserved';
          await queue.remove(options.jobId);
        }

        if (await queue.getJob(options.jobId)) return 'preserved';
        await queue.add(jobName, data, options);
        this.queueConnectionWarningEmitted = false;
        return 'replaced';
      } finally {
        await client.eval(RELEASE_OWNED_LOCK_SCRIPT, 1, lockKey, lockToken);
      }
    } catch (error) {
      if (this.isQueueRedisAvailabilityError(error)) {
        throw this.queueRedisUnavailable();
      }
      throw new Error('queue_recovery_command_failed');
    }
  }

  async registerRepeatJob<TData extends object>(
    queueName: string,
    jobName: string,
    data: TData,
    options: JobsOptions & {
      jobId: string;
      repeat: NonNullable<JobsOptions['repeat']>;
    },
  ): Promise<void> {
    const registration: BullmqRepeatRegistration = {
      queueName,
      jobName,
      jobId: options.jobId,
      pattern: options.repeat.pattern,
      every: options.repeat.every,
    };
    const key = repeatRegistrationKey(registration);
    this.desiredRepeatRegistrations.set(key, {
      registration,
      data,
      options,
    });
    do {
      await this.restoreDesiredRepeatRegistrations();
    } while (
      !repeatRegistrationsEqual(this.repeatRegistrations.get(key), registration)
    );
  }

  ping(): Promise<void> {
    if (this.isShuttingDown) {
      return Promise.reject(this.queueRedisUnavailable());
    }

    if (this.queueReadinessFlight) {
      return this.queueReadinessFlight;
    }

    let execution: Promise<void>;
    execution = this.executeQueueReadiness().finally(() => {
      if (this.queueReadinessFlight === execution) {
        this.queueReadinessFlight = null;
      }
    });
    this.queueReadinessFlight = execution;
    return execution;
  }

  hasAvailableWorkers(queueNames: readonly string[]): boolean {
    return queueNames.every((queueName) =>
      this.workers.some(
        (worker) =>
          worker.name === queueName &&
          this.workerRunAvailable.get(worker) === true &&
          worker.closing === undefined &&
          worker.isRunning() &&
          !worker.isPaused(),
      ),
    );
  }

  hasExactAvailableWorkers(queueNames: readonly string[]): boolean {
    const expected = [...queueNames].sort();
    const registered = this.workers.map((worker) => worker.name).sort();
    return (
      expected.length === registered.length &&
      expected.every((queueName, index) => queueName === registered[index]) &&
      this.hasAvailableWorkers(queueNames)
    );
  }

  hasExactRepeatRegistrations(
    registrations: readonly BullmqRepeatRegistration[],
  ): boolean {
    if (registrations.length !== this.repeatRegistrations.size) return false;
    return registrations.every((registration) => {
      const current = this.repeatRegistrations.get(
        repeatRegistrationKey(registration),
      );
      return (
        current?.pattern === registration.pattern &&
        current?.every === registration.every
      );
    });
  }

  getRegisteredWorkerQueueNames(): readonly string[] {
    return Object.freeze(this.workers.map((worker) => worker.name).sort());
  }

  getRepeatRegistrations(): readonly BullmqRepeatRegistration[] {
    return Object.freeze(
      [...this.repeatRegistrations.values()].sort((left, right) =>
        repeatRegistrationKey(left).localeCompare(repeatRegistrationKey(right)),
      ),
    );
  }

  getDesiredRepeatRegistrations(): readonly BullmqRepeatRegistration[] {
    return Object.freeze(
      [...this.desiredRepeatRegistrations.values()]
        .map((definition) => definition.registration)
        .sort((left, right) =>
          repeatRegistrationKey(left).localeCompare(
            repeatRegistrationKey(right),
          ),
        ),
    );
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
    await this.ensureCommandConnectionReady();
    const queue = this.getQueue(name);
    let counts: Awaited<ReturnType<Queue['getJobCounts']>>;
    try {
      counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      );
    } catch (error) {
      this.rethrowSanitizedQueueCommandError(error);
    }

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
      { connection: this.getWorkerConnection(), autorun: false },
      WorkerShutdownRedisConnection,
    );

    worker.on('error', (error: Error) => {
      if (this.isExpectedShutdownError(worker, error)) {
        return;
      }

      if (this.isShuttingDown) {
        this.logger.error({
          event: 'lifecycle.resource.failed',
          resource: 'bullmq_worker',
          stage: 'drain',
        });
        return;
      }

      if (this.workerRuntimeWarnings.has(worker as unknown as Worker)) return;
      this.workerRuntimeWarnings.add(worker as unknown as Worker);
      this.logger.error({
        event: 'bullmq.worker.failed',
        stage: 'runtime',
      });
    });
    worker.on('ready', () => {
      this.workerRuntimeWarnings.delete(worker as unknown as Worker);
    });

    this.retainBlockingConnectionErrorSafety(worker);
    this.trackBlockingConnectionStreams(worker);
    this.stopLateStalledCheckOnShutdown(worker);

    this.workers.push(worker as unknown as Worker);
    this.workerRunAvailable.set(worker as unknown as Worker, true);
    const run = worker.run().then(
      () => {
        this.workerRunAvailable.set(worker as unknown as Worker, false);
        if (!this.isShuttingDown) {
          this.logger.error({
            event: 'bullmq.worker.run_stopped',
            stage: 'unexpected_settlement',
          });
        }
      },
      (error: Error) => {
        this.workerRunAvailable.set(worker as unknown as Worker, false);
        worker.emit('error', error);
      },
    );
    this.workerRuns.set(worker as unknown as Worker, run);
    return worker;
  }

  onModuleDestroy(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.shutdown();
    }

    return this.shutdownPromise;
  }

  beginWorkerDrain(): Promise<void> {
    if (!this.workerDrainPromise) {
      this.isShuttingDown = true;
      this.workerDrainPromise = Promise.all(
        this.workers.map((worker) => this.closeWorker(worker)),
      ).then(() => undefined);
    }

    return this.workerDrainPromise;
  }

  private async shutdown(): Promise<void> {
    await this.beginWorkerDrain();

    const repeatRestorationFlight = this.repeatRestorationFlight;
    if (repeatRestorationFlight) {
      await repeatRestorationFlight.catch(() => undefined);
    }

    const readinessFlight = this.queueReadinessFlight;
    if (readinessFlight) {
      await readinessFlight.catch(() => undefined);
    }

    const readinessClient = this.queueReadinessClient;
    if (readinessClient) {
      if (this.queueReadinessClient === readinessClient) {
        this.queueReadinessClient = undefined;
      }
      await this.closeQueueReadinessClient(readinessClient, 'graceful');
    }

    await Promise.all(
      [...this.queues.values()].map((queue) => this.closeQueue(queue)),
    );

    await Promise.all([
      this.closeOwnedConnection(this.connection),
      this.workerConnection
        ? this.closeOwnedConnection(this.workerConnection)
        : Promise.resolve(),
    ]);
    await Promise.all([
      this.sharedStreamSettlement(),
      this.workerStreamSettlement?.() ?? Promise.resolve(),
    ]);
  }

  private async executeQueueReadiness(): Promise<void> {
    const ownedClient = this.queueReadinessClient;
    if (ownedClient) {
      await this.checkOwnedQueueReadinessClient(ownedClient);
    } else {
      await this.connectQueueReadinessCandidate();
    }

    if (!this.haveAllDesiredRepeatRegistrations()) {
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }
  }

  private restoreDesiredRepeatRegistrations(): Promise<void> {
    if (this.isShuttingDown) {
      return Promise.reject(this.queueRedisUnavailable());
    }
    if (this.repeatRestorationFlight) return this.repeatRestorationFlight;

    let execution: Promise<void>;
    execution = this.executeRepeatRestoration().finally(() => {
      if (this.repeatRestorationFlight === execution) {
        this.repeatRestorationFlight = null;
      }
    });
    this.repeatRestorationFlight = execution;
    return execution;
  }

  private async executeRepeatRestoration(): Promise<void> {
    await this.ensureCommandConnectionReady();

    while (!this.isShuttingDown) {
      const missing = [...this.desiredRepeatRegistrations.entries()].filter(
        ([key, desired]) =>
          !repeatRegistrationsEqual(
            this.repeatRegistrations.get(key),
            desired.registration,
          ),
      );
      if (missing.length === 0) return;

      for (const [key, desired] of missing) {
        if (this.isShuttingDown) throw this.queueRedisUnavailable();
        try {
          await this.getQueue(desired.registration.queueName).add(
            desired.registration.jobName,
            desired.data,
            desired.options,
          );
          this.repeatRegistrations.set(key, desired.registration);
          this.queueConnectionWarningEmitted = false;
        } catch (error) {
          this.repeatRegistrations.delete(key);
          this.rethrowSanitizedQueueCommandError(error);
        }
      }
    }

    throw this.queueRedisUnavailable();
  }

  private haveAllDesiredRepeatRegistrations(): boolean {
    return [...this.desiredRepeatRegistrations.entries()].every(
      ([key, desired]) =>
        repeatRegistrationsEqual(
          this.repeatRegistrations.get(key),
          desired.registration,
        ),
    );
  }

  private async checkOwnedQueueReadinessClient(client: IORedis): Promise<void> {
    if (client.status !== 'ready') {
      await this.retireFailedQueueReadinessClient(client);
      throw this.queueRedisUnavailable();
    }

    let pingOperation: Promise<void>;
    try {
      pingOperation = client.ping().then(() => undefined);
    } catch {
      await this.retireFailedQueueReadinessClient(client);
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }

    const outcome = await this.settleWithin(
      pingOperation,
      BULLMQ_READINESS_OPERATION_TIMEOUT_MS,
    );
    if (
      outcome !== 'fulfilled' ||
      this.isShuttingDown ||
      this.queueReadinessClient !== client ||
      client.status !== 'ready'
    ) {
      await this.retireFailedQueueReadinessClient(client);
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }

    this.queueReadinessWarningEmitted = false;
  }

  private async connectQueueReadinessCandidate(): Promise<void> {
    let candidate: IORedis | undefined;
    try {
      candidate = new IORedis(this.redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: BULLMQ_READINESS_CONNECT_TIMEOUT_MS,
        commandTimeout: BULLMQ_READINESS_COMMAND_TIMEOUT_MS,
        retryStrategy: () => null,
      });
      candidate.on('error', () => {
        this.warnQueueReadinessUnavailable();
      });
    } catch {
      if (candidate) {
        await this.closeQueueReadinessClient(candidate, 'force');
      }
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }

    let connectAndPing: Promise<void>;
    try {
      connectAndPing = candidate
        .connect()
        .then(() => candidate.ping())
        .then(() => undefined);
    } catch {
      await this.closeQueueReadinessClient(candidate, 'force');
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }

    const outcome = await this.settleWithin(
      connectAndPing,
      BULLMQ_READINESS_OPERATION_TIMEOUT_MS,
    );
    if (
      outcome !== 'fulfilled' ||
      this.isShuttingDown ||
      candidate.status !== 'ready' ||
      this.queueReadinessClient !== undefined
    ) {
      await this.closeQueueReadinessClient(candidate, 'force');
      this.warnQueueReadinessUnavailable();
      throw this.queueRedisUnavailable();
    }

    this.queueReadinessClient = candidate;
    this.queueReadinessWarningEmitted = false;
  }

  private async retireFailedQueueReadinessClient(
    client: IORedis,
  ): Promise<void> {
    if (this.queueReadinessClient === client) {
      this.queueReadinessClient = undefined;
    }
    await this.closeQueueReadinessClient(client, 'force');
  }

  private closeQueueReadinessClient(
    client: IORedis,
    mode: QueueReadinessCloseMode,
  ): Promise<void> {
    const existing = this.queueReadinessClosePromises.get(client);
    if (existing) {
      return existing;
    }

    const close =
      mode === 'force'
        ? this.forceDisconnectQueueReadinessClient(client)
        : this.gracefullyCloseQueueReadinessClient(client);
    this.queueReadinessClosePromises.set(client, close);
    return close;
  }

  private async forceDisconnectQueueReadinessClient(
    client: IORedis,
  ): Promise<void> {
    if (this.disconnectedQueueReadinessClients.has(client)) {
      return;
    }

    this.disconnectedQueueReadinessClients.add(client);
    try {
      client.disconnect();
    } catch {
      // Forced readiness retirement is best-effort and must remain bounded.
    }
  }

  private async gracefullyCloseQueueReadinessClient(
    client: IORedis,
  ): Promise<void> {
    let quitOperation: Promise<unknown>;
    try {
      quitOperation = client.quit();
    } catch {
      await this.forceDisconnectQueueReadinessClient(client);
      return;
    }

    const outcome = await this.settleWithin(
      quitOperation,
      BULLMQ_READINESS_CLOSE_TIMEOUT_MS,
    );
    if (outcome !== 'fulfilled') {
      await this.forceDisconnectQueueReadinessClient(client);
    }
  }

  private async settleWithin(
    operation: Promise<unknown>,
    timeoutMilliseconds: number,
  ): Promise<BoundedSettlement> {
    const observed = operation.then<BoundedSettlement, BoundedSettlement>(
      () => 'fulfilled',
      () => 'rejected',
    );
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        observed,
        new Promise<BoundedSettlement>((resolve) => {
          timer = setTimeout(() => resolve('timed_out'), timeoutMilliseconds);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private warnQueueReadinessUnavailable(): void {
    if (this.queueReadinessWarningEmitted || this.isShuttingDown) {
      return;
    }

    this.queueReadinessWarningEmitted = true;
    this.logger.warn({
      event: 'bullmq.readiness.unavailable',
      stage: 'connection',
    });
  }

  private ensureCommandConnectionReady(): Promise<void> {
    if (this.isShuttingDown) {
      return Promise.reject(this.queueRedisUnavailable());
    }
    if (this.connection.status === 'ready') {
      return Promise.resolve();
    }
    if (this.commandConnectionFlight) {
      return this.commandConnectionFlight;
    }
    if (this.connection.status !== 'wait') {
      return Promise.reject(this.queueRedisUnavailable());
    }

    let execution: Promise<void>;
    execution = this.connectCommandConnection().finally(() => {
      if (this.commandConnectionFlight === execution) {
        this.commandConnectionFlight = null;
      }
    });
    this.commandConnectionFlight = execution;
    return execution;
  }

  private async connectCommandConnection(): Promise<void> {
    let operation: Promise<void>;
    try {
      operation = this.connection.connect();
    } catch {
      throw this.queueRedisUnavailable();
    }

    const outcome = await this.settleWithin(
      operation,
      BULLMQ_COMMAND_CONNECT_TIMEOUT_MS + BULLMQ_COMMAND_TIMEOUT_MS,
    );
    if (
      outcome !== 'fulfilled' ||
      this.isShuttingDown ||
      this.connection.status !== 'ready'
    ) {
      throw this.queueRedisUnavailable();
    }
  }

  private queueRedisUnavailable(): Error {
    return new Error('queue_redis_unavailable');
  }

  private rethrowSanitizedQueueCommandError(error: unknown): never {
    if (this.isQueueRedisAvailabilityError(error)) {
      throw this.queueRedisUnavailable();
    }
    throw error;
  }

  private isQueueRedisAvailabilityError(error: unknown): boolean {
    if (!(error instanceof Error)) return true;
    const code = (error as NodeJS.ErrnoException).code;
    if (code && QUEUE_AVAILABILITY_ERROR_CODES.has(code)) return true;

    const normalizedMessage = error.message.toLowerCase();
    return QUEUE_AVAILABILITY_ERROR_MESSAGES.some((message) =>
      normalizedMessage.includes(message),
    );
  }

  private getWorkerConnection(): IORedis {
    if (this.workerConnection) {
      return this.workerConnection;
    }

    const connection = new BullmqWorkerRedisClient(this.redisUrl);
    this.workerConnection = connection;
    this.workerStreamSettlement = this.trackRedisClientStreams(
      connection as unknown as RedisShutdownClient,
    );
    connection.on('error', (error: Error) => {
      if (this.isExpectedOwnedConnectionShutdownError(connection, error)) {
        return;
      }

      if (!this.workerConnectionWarningEmitted) {
        this.workerConnectionWarningEmitted = true;
        this.logger.error({
          event: 'bullmq.worker.redis.unavailable',
          stage: 'connection',
        });
      }
    });
    connection.on('ready', () => {
      this.workerConnectionWarningEmitted = false;
    });
    return connection;
  }

  private async closeOwnedConnection(connection: IORedis): Promise<void> {
    try {
      if (
        connection.status === 'ready' ||
        connection.status === 'connect' ||
        connection.status === 'reconnecting'
      ) {
        await connection.quit();
        return;
      }

      connection.disconnect();
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        this.isExpectedOwnedConnectionShutdownError(connection, error)
      ) {
        return;
      }

      throw error;
    }
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
    return this.isExpectedOwnedConnectionShutdownError(this.connection, error);
  }

  private isExpectedOwnedConnectionShutdownError(
    connection: IORedis,
    error: Error,
  ): boolean {
    return (
      this.isShuttingDown &&
      this.isConnectionClosureError(error) &&
      (connection.status === 'close' ||
        connection.status === 'end' ||
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

function repeatRegistrationKey(
  registration: Pick<
    BullmqRepeatRegistration,
    'queueName' | 'jobName' | 'jobId'
  >,
): string {
  return `${registration.queueName}:${registration.jobName}:${registration.jobId}`;
}

function repeatRegistrationsEqual(
  current: BullmqRepeatRegistration | undefined,
  desired: BullmqRepeatRegistration,
): boolean {
  return (
    current?.queueName === desired.queueName &&
    current.jobName === desired.jobName &&
    current.jobId === desired.jobId &&
    current.pattern === desired.pattern &&
    current.every === desired.every
  );
}

function queueRedisReconnectDelay(attempt: number): number {
  return Math.min(
    50 * 2 ** Math.min(attempt - 1, 5),
    BULLMQ_RECONNECT_DELAY_MAX_MS,
  );
}
