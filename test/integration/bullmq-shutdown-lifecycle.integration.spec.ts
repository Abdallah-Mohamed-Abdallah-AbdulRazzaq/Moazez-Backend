import type { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import IORedis from 'ioredis';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

jest.setTimeout(30_000);

const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;

describe('BullMQ graceful shutdown and recovery', () => {
  if (!redisUrl) {
    throw new Error(
      'TEST_REDIS_URL or REDIS_URL is required for isolated BullMQ lifecycle proof',
    );
  }

  it('finishes active work once, preserves queued work, and resumes after restart', async () => {
    const queueName = `shutdown-drain-${randomUUID()}`;
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const replacementCompleted = deferred<void>();
    const processed: string[] = [];
    const firstService = createService(redisUrl);
    const secondService = createService(redisUrl);

    try {
      firstService.createWorker<{ sequence: number }>(
        queueName,
        async (job) => {
          processed.push(`first:${job.data.sequence}`);
          firstStarted.resolve();
          await releaseFirst.promise;
        },
      );
      const first = await firstService.addJob(
        queueName,
        'lifecycle-proof',
        { sequence: 1 },
        { removeOnComplete: false },
      );
      const second = await firstService.addJob(
        queueName,
        'lifecycle-proof',
        { sequence: 2 },
        { removeOnComplete: false },
      );

      await firstStarted.promise;
      const drain = firstService.beginWorkerDrain();
      releaseFirst.resolve();
      await drain;

      expect(await first.getState()).toBe('completed');
      expect(await second.getState()).toBe('waiting');
      expect(processed).toEqual(['first:1']);

      secondService.createWorker<{ sequence: number }>(
        queueName,
        async (job) => {
          processed.push(`replacement:${job.data.sequence}`);
          replacementCompleted.resolve();
        },
      );
      await replacementCompleted.promise;
      await eventually(async () => {
        expect(await second.getState()).toBe('completed');
      });

      expect(processed).toEqual(['first:1', 'replacement:2']);
    } finally {
      await Promise.allSettled([
        firstService.onModuleDestroy(),
        secondService.onModuleDestroy(),
      ]);
      await removeQueue(redisUrl, queueName);
    }
  });

  it('recovers an abandoned active job through stalled-job semantics', async () => {
    const queueName = `shutdown-stalled-${randomUUID()}`;
    const queue = new Queue(queueName, {
      connection: redisConnectionOptions(redisUrl),
    });
    const child = startAbandoningWorker(redisUrl, queueName);
    let replacement: Worker | undefined;

    try {
      const job = await queue.add(
        'stalled-proof',
        { synthetic: true },
        { removeOnComplete: false },
      );
      await waitForChildActive(child, String(job.id));
      child.kill('SIGKILL');
      await waitForChildExit(child);

      const recovered = deferred<string>();
      replacement = new Worker(
        queueName,
        async (activeJob: Job) => {
          recovered.resolve(String(activeJob.id));
        },
        {
          connection: redisConnectionOptions(redisUrl),
          lockDuration: 1_000,
          stalledInterval: 500,
          maxStalledCount: 2,
        },
      );

      await expect(recovered.promise).resolves.toBe(String(job.id));
      await eventually(async () => {
        expect(await job.getState()).toBe('completed');
      });
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      await replacement?.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});

function createService(url: string): BullmqService {
  return new BullmqService({
    getOrThrow: jest.fn(() => url),
  } as unknown as ConfigService);
}

function redisConnectionOptions(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

async function removeQueue(url: string, queueName: string): Promise<void> {
  const queue = new Queue(queueName, {
    connection: redisConnectionOptions(url),
  });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}

function startAbandoningWorker(url: string, queueName: string): ChildProcess {
  const script = `
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.argv[1], { maxRetriesPerRequest: null });
    const worker = new Worker(process.argv[2], async (job) => {
      if (process.send) process.send({ active: String(job.id) });
      await new Promise(() => undefined);
    }, {
      connection,
      lockDuration: 1000,
      stalledInterval: 500,
      maxStalledCount: 2
    });
    worker.on('error', (error) => {
      if (process.send) process.send({ error: error.name });
    });
  `;

  return spawn(process.execPath, ['-e', script, url, queueName], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}

function waitForChildActive(
  child: ChildProcess,
  expectedJobId: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('abandoning worker did not become active')),
      10_000,
    );
    child.on('message', (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'active' in message &&
        message.active === expectedJobId
      ) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`abandoning worker exited early with code ${code}`));
    });
  });
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
