import type { ConfigService } from "@nestjs/config";
import { Job, Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import IORedis from "ioredis";
import { BullmqService } from "../../src/infrastructure/queue/bullmq.service";
import { BoundedProbeExecutor } from "../../src/modules/health/bounded-probe-executor";

jest.setTimeout(30_000);

const redisUrl = process.env.TEST_QUEUE_REDIS_URL;

describe("BullMQ graceful shutdown and recovery", () => {
  if (!redisUrl) {
    throw new Error(
      "TEST_QUEUE_REDIS_URL is required for isolated BullMQ lifecycle proof",
    );
  }

  it("finishes active work once, preserves queued work, and resumes after restart", async () => {
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
        "lifecycle-proof",
        { sequence: 1 },
        { removeOnComplete: false },
      );
      const second = await firstService.addJob(
        queueName,
        "lifecycle-proof",
        { sequence: 2 },
        { removeOnComplete: false },
      );

      await firstStarted.promise;
      expect(firstService.hasAvailableWorkers([queueName])).toBe(true);
      const drain = firstService.beginWorkerDrain();
      expect(firstService.hasAvailableWorkers([queueName])).toBe(false);
      releaseFirst.resolve();
      await drain;

      expect(await first.getState()).toBe("completed");
      expect(await second.getState()).toBe("waiting");
      expect(processed).toEqual(["first:1"]);

      secondService.createWorker<{ sequence: number }>(
        queueName,
        async (job) => {
          processed.push(`replacement:${job.data.sequence}`);
          replacementCompleted.resolve();
        },
      );
      expect(secondService.hasAvailableWorkers([queueName])).toBe(true);
      await replacementCompleted.promise;
      await eventually(async () => {
        expect(await second.getState()).toBe("completed");
      });

      expect(processed).toEqual(["first:1", "replacement:2"]);
    } finally {
      await Promise.allSettled([
        firstService.onModuleDestroy(),
        secondService.onModuleDestroy(),
      ]);
      await removeQueue(redisUrl, queueName);
    }
  });

  it("recovers an abandoned active job through stalled-job semantics", async () => {
    const queueName = `shutdown-stalled-${randomUUID()}`;
    const queue = new Queue(queueName, {
      connection: redisConnectionOptions(redisUrl),
    });
    const child = startAbandoningWorker(redisUrl, queueName);
    let replacement: Worker | undefined;

    try {
      const job = await queue.add(
        "stalled-proof",
        { synthetic: true },
        { removeOnComplete: false },
      );
      await waitForChildActive(child, String(job.id));
      child.kill("SIGKILL");
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
        expect(await job.getState()).toBe("completed");
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await replacement?.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it("bounds readiness through a suspended stable endpoint and preserves the same worker", async () => {
    const proxy = new SuspendableRedisProxy(redisUrl);
    const queueName = `readiness-recovery-${randomUUID()}`;
    const firstCompleted = deferred<void>();
    const secondCompleted = deferred<void>();
    const processed: number[] = [];
    let service: BullmqService | undefined;

    try {
      const proxyUrl = await proxy.listen();
      service = createService(proxyUrl);
      const worker = service.createWorker<{ sequence: number }>(
        queueName,
        async (job) => {
          processed.push(job.data.sequence);
          if (job.data.sequence === 1) firstCompleted.resolve();
          if (job.data.sequence === 2) secondCompleted.resolve();
        },
      );

      await service.addJob(queueName, "readiness-proof", { sequence: 1 });
      await firstCompleted.promise;
      await expect(service.ping()).resolves.toBeUndefined();
      expect(service.hasAvailableWorkers([queueName])).toBe(true);

      proxy.suspendTraffic();
      const executor = new BoundedProbeExecutor();
      const outageStartedAt = Date.now();
      await expect(
        executor.run("queue-redis", () => service!.ping()),
      ).resolves.toBe(false);
      const outageElapsedMilliseconds = Date.now() - outageStartedAt;

      expect(outageElapsedMilliseconds).toBeGreaterThanOrEqual(350);
      expect(outageElapsedMilliseconds).toBeLessThan(750);
      expect(readinessState(service).queueReadinessFlight).toBeNull();
      expect(executorState(executor).active.size).toBe(0);
      expect(service.hasAvailableWorkers([queueName])).toBe(true);

      proxy.resumeTraffic();
      await expect(
        executor.run("queue-redis", () => service!.ping()),
      ).resolves.toBe(true);
      expect(readinessState(service).queueReadinessFlight).toBeNull();
      expect(executorState(executor).active.size).toBe(0);

      await service.addJob(queueName, "readiness-proof", { sequence: 2 });
      await secondCompleted.promise;
      expect(processed).toEqual([1, 2]);
      expect(service.hasAvailableWorkers([queueName])).toBe(true);
      expect(worker).toBe(
        (service as unknown as { workers: Worker[] }).workers[0],
      );
    } finally {
      proxy.resumeTraffic();
      await service?.onModuleDestroy();
      await removeQueue(redisUrl, queueName);
      await proxy.stop();
      expect(proxy.openSocketCount).toBe(0);
    }
  });
});

class SuspendableRedisProxy {
  private readonly target: URL;
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private suspended = false;
  private listening = false;

  constructor(targetUrl: string) {
    this.target = new URL(targetUrl);
    this.server = createServer((downstream) => {
      const upstream = createConnection({
        host: this.target.hostname,
        port: this.target.port ? Number(this.target.port) : 6379,
      });
      let closed = false;
      const closePair = (): void => {
        if (closed) return;
        closed = true;
        downstream.unpipe(upstream);
        upstream.unpipe(downstream);
        downstream.destroy();
        upstream.destroy();
        this.sockets.delete(downstream);
        this.sockets.delete(upstream);
      };

      this.sockets.add(downstream);
      this.sockets.add(upstream);
      downstream.on("error", closePair);
      upstream.on("error", closePair);
      downstream.on("close", closePair);
      upstream.on("close", closePair);
      downstream.pipe(upstream);
      upstream.pipe(downstream);
      if (this.suspended) {
        downstream.pause();
        upstream.pause();
      }
    });
  }

  get openSocketCount(): number {
    return this.sockets.size;
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    this.listening = true;
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("redis_proxy_address_unavailable");
    }

    const proxyUrl = new URL(this.target.toString());
    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String(address.port);
    return proxyUrl.toString();
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
    for (const socket of [...this.sockets]) socket.destroy();
    this.sockets.clear();
    if (!this.listening) return;

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.listening = false;
  }
}

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

  return spawn(process.execPath, ["-e", script, url, queueName], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

function waitForChildActive(
  child: ChildProcess,
  expectedJobId: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("abandoning worker did not become active")),
      10_000,
    );
    child.on("message", (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "active" in message &&
        message.active === expectedJobId
      ) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`abandoning worker exited early with code ${code}`));
    });
  });
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => child.once("exit", () => resolve()));
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

function readinessState(service: BullmqService): {
  queueReadinessFlight: Promise<void> | null;
} {
  return service as unknown as {
    queueReadinessFlight: Promise<void> | null;
  };
}

function executorState(executor: BoundedProbeExecutor): {
  active: Map<string, Promise<boolean>>;
} {
  return executor as unknown as {
    active: Map<string, Promise<boolean>>;
  };
}
