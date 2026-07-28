import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { ApplicationLifecycleState } from './application-lifecycle.state';

export const SUPPORTED_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
export type SupportedShutdownSignal =
  (typeof SUPPORTED_SHUTDOWN_SIGNALS)[number];

export const LIFECYCLE_EVENTS = {
  started: 'lifecycle.shutdown.started',
  intakeStopped: 'lifecycle.shutdown.intake_stopped',
  completed: 'lifecycle.shutdown.completed',
  timedOut: 'lifecycle.shutdown.timed_out',
  failed: 'lifecycle.shutdown.failed',
  forceExit: 'lifecycle.shutdown.force_exit',
} as const;

interface ShutdownLogger {
  log(event: Record<string, string | number>): void;
  error(event: Record<string, string | number>): void;
}

interface QueueLifecycle {
  beginWorkerDrain(): Promise<void>;
}

interface RealtimeLifecycle {
  disconnectSocketsForShutdown(): Promise<void>;
}

interface ProcessLifecycle {
  exitCode?: string | number | null;
  on(signal: SupportedShutdownSignal, listener: () => void): unknown;
  off(signal: SupportedShutdownSignal, listener: () => void): unknown;
  exit(code: number): never | void;
}

interface ShutdownClock {
  now(): number;
  setTimeout(callback: () => void, milliseconds: number): NodeJS.Timeout;
  clearTimeout(timer: NodeJS.Timeout): void;
}

export interface GracefulShutdownDependencies {
  app: Pick<INestApplication, 'close'>;
  httpServer: Pick<HttpServer, 'close'>;
  lifecycle: ApplicationLifecycleState;
  queue: QueueLifecycle;
  realtime: RealtimeLifecycle;
  timeoutMs: number;
  logger: ShutdownLogger;
  processTarget?: ProcessLifecycle;
  clock?: ShutdownClock;
}

const defaultClock: ShutdownClock = {
  now: () => Date.now(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class GracefulShutdownCoordinator {
  private readonly processTarget: ProcessLifecycle;
  private readonly clock: ShutdownClock;
  private shutdownPromise: Promise<void> | null = null;
  private installed = false;
  private completed = false;
  private readonly signalListeners = new Map<
    SupportedShutdownSignal,
    () => void
  >();

  constructor(private readonly dependencies: GracefulShutdownDependencies) {
    this.processTarget = dependencies.processTarget ?? process;
    this.clock = dependencies.clock ?? defaultClock;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    for (const signal of SUPPORTED_SHUTDOWN_SIGNALS) {
      const listener = (): void => {
        void this.handleSignal(signal);
      };
      this.signalListeners.set(signal, listener);
      this.processTarget.on(signal, listener);
    }
  }

  dispose(): void {
    if (!this.installed) return;
    this.installed = false;
    for (const signal of SUPPORTED_SHUTDOWN_SIGNALS) {
      const listener = this.signalListeners.get(signal);
      if (listener) this.processTarget.off(signal, listener);
    }
    this.signalListeners.clear();
  }

  handleSignal(signal: SupportedShutdownSignal): Promise<void> {
    if (this.completed) return Promise.resolve();

    if (this.shutdownPromise) {
      this.dependencies.logger.error({
        event: LIFECYCLE_EVENTS.forceExit,
        signal,
      });
      this.dispose();
      this.processTarget.exit(1);
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.runBoundedShutdown(signal);
    return this.shutdownPromise;
  }

  private async runBoundedShutdown(
    signal: SupportedShutdownSignal,
  ): Promise<void> {
    const startedAt = this.clock.now();
    this.dependencies.logger.log({
      event: LIFECYCLE_EVENTS.started,
      signal,
      timeoutMs: this.dependencies.timeoutMs,
    });

    let timeout: NodeJS.Timeout | undefined;
    let timedOut = false;
    let exitNonZero = false;

    try {
      await Promise.race([
        this.runShutdownSequence(signal, startedAt),
        new Promise<never>((_, reject) => {
          timeout = this.clock.setTimeout(() => {
            timedOut = true;
            reject(new Error('shutdown_timeout'));
          }, this.dependencies.timeoutMs);
        }),
      ]);

      this.completed = true;
      this.processTarget.exitCode = 0;
      this.dependencies.logger.log({
        event: LIFECYCLE_EVENTS.completed,
        signal,
        elapsedMs: this.elapsedSince(startedAt),
      });
      this.dispose();
    } catch {
      this.dependencies.logger.error({
        event: timedOut ? LIFECYCLE_EVENTS.timedOut : LIFECYCLE_EVENTS.failed,
        signal,
        elapsedMs: this.elapsedSince(startedAt),
        timeoutMs: this.dependencies.timeoutMs,
      });
      this.dispose();
      exitNonZero = true;
    } finally {
      if (timeout) this.clock.clearTimeout(timeout);
    }

    if (exitNonZero) this.processTarget.exit(1);
  }

  private async runShutdownSequence(
    signal: SupportedShutdownSignal,
    startedAt: number,
  ): Promise<void> {
    this.dependencies.lifecycle.beginDraining();
    const shutdownOperations = Promise.all([
      stopHttpIntake(this.dependencies.httpServer),
      this.dependencies.queue.beginWorkerDrain(),
      this.dependencies.lifecycle.waitForIdle().then(async () => {
        await this.dependencies.realtime.disconnectSocketsForShutdown();
      }),
    ]);

    this.dependencies.logger.log({
      event: LIFECYCLE_EVENTS.intakeStopped,
      signal,
      elapsedMs: this.elapsedSince(startedAt),
      activeWork: this.dependencies.lifecycle.getActiveWorkCount(),
    });

    await shutdownOperations;
    await this.dependencies.app.close();
  }

  private elapsedSince(startedAt: number): number {
    return Math.max(0, this.clock.now() - startedAt);
  }
}

function stopHttpIntake(server: Pick<HttpServer, 'close'>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
