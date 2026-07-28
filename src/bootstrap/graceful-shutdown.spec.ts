import { EventEmitter } from 'node:events';
import { ApplicationLifecycleState } from './application-lifecycle.state';
import {
  GracefulShutdownCoordinator,
  LIFECYCLE_EVENTS,
  type GracefulShutdownDependencies,
  type SupportedShutdownSignal,
} from './graceful-shutdown';

describe('GracefulShutdownCoordinator', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'runs one ordered graceful shutdown for %s',
    async (signal) => {
      const harness = createHarness();
      const admitted = harness.lifecycle.tryAdmit('http');
      const shutdown = harness.coordinator.handleSignal(signal);

      expect(harness.httpServer.close).toHaveBeenCalledTimes(1);
      expect(harness.queue.beginWorkerDrain).toHaveBeenCalledTimes(1);
      expect(harness.app.close).not.toHaveBeenCalled();

      admitted?.release();
      harness.httpClose.resolve();
      await shutdown;

      expect(
        harness.realtime.disconnectSocketsForShutdown,
      ).toHaveBeenCalledTimes(1);
      expect(harness.app.close).toHaveBeenCalledTimes(1);
      expect(harness.processTarget.exit).not.toHaveBeenCalled();
      expect(harness.processTarget.exitCode).toBe(0);
      expect(harness.events()).toEqual([
        LIFECYCLE_EVENTS.started,
        LIFECYCLE_EVENTS.intakeStopped,
        LIFECYCLE_EVENTS.completed,
      ]);
    },
  );

  it('installs exactly two listeners and removes them after completion', async () => {
    const harness = createHarness({ closeHttpImmediately: true });

    harness.coordinator.install();
    harness.coordinator.install();
    expect(harness.processTarget.listenerCount('SIGTERM')).toBe(1);
    expect(harness.processTarget.listenerCount('SIGINT')).toBe(1);

    harness.processTarget.emit('SIGTERM');
    await eventually(() => expect(harness.app.close).toHaveBeenCalledTimes(1));
    expect(harness.processTarget.listenerCount('SIGTERM')).toBe(0);
    expect(harness.processTarget.listenerCount('SIGINT')).toBe(0);
  });

  it('forces a non-zero immediate exit on a second active signal', async () => {
    const harness = createHarness();

    const shutdown = harness.coordinator.handleSignal('SIGTERM');
    void harness.coordinator.handleSignal('SIGINT');

    expect(harness.httpServer.close).toHaveBeenCalledTimes(1);
    expect(harness.queue.beginWorkerDrain).toHaveBeenCalledTimes(1);
    expect(harness.processTarget.exit).toHaveBeenCalledWith(1);
    expect(harness.events()).toContain(LIFECYCLE_EVENTS.forceExit);

    harness.httpClose.resolve();
    await shutdown;
  });

  it('keeps the deadline referenced and clears it after successful shutdown', async () => {
    const deadline = deadlineHarness();
    const harness = createHarness({
      closeHttpImmediately: true,
      clock: deadline.clock,
    });

    await harness.coordinator.handleSignal('SIGTERM');

    expect(deadline.setTimeout).toHaveBeenCalledTimes(1);
    expect(deadline.timer.unref).not.toHaveBeenCalled();
    expect(deadline.clearTimeout).toHaveBeenCalledWith(deadline.timer);
  });

  it('clears the referenced deadline after lifecycle failure', async () => {
    const deadline = deadlineHarness();
    const harness = createHarness({
      closeHttpImmediately: true,
      clock: deadline.clock,
    });
    harness.queue.beginWorkerDrain.mockRejectedValue(
      new Error('fixture failure'),
    );

    await harness.coordinator.handleSignal('SIGTERM');

    expect(deadline.timer.unref).not.toHaveBeenCalled();
    expect(deadline.clearTimeout).toHaveBeenCalledWith(deadline.timer);
    expect(harness.events()).toContain(LIFECYCLE_EVENTS.failed);
    expect(deadline.clearTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      harness.processTarget.exit.mock.invocationCallOrder[0],
    );
  });

  it('uses only the sanitized timed-out event and exits non-zero at the deadline', async () => {
    const deadline = deadlineHarness();
    const harness = createHarness({
      closeHttpImmediately: true,
      clock: deadline.clock,
    });
    harness.app.close.mockImplementation(
      () => new Promise<void>(() => undefined),
    );

    const shutdown = harness.coordinator.handleSignal('SIGTERM');
    await flushPromises();
    deadline.fire();
    await shutdown;

    expect(harness.processTarget.exit).toHaveBeenCalledWith(1);
    expect(harness.logger.error).toHaveBeenCalledTimes(1);
    expect(harness.logger.error).toHaveBeenCalledWith({
      event: LIFECYCLE_EVENTS.timedOut,
      signal: 'SIGTERM',
      elapsedMs: 0,
      timeoutMs: 15_000,
    });
    expect(deadline.timer.unref).not.toHaveBeenCalled();
    expect(deadline.clearTimeout).toHaveBeenCalledWith(deadline.timer);
    expect(deadline.clearTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      harness.processTarget.exit.mock.invocationCallOrder[0],
    );
  });

  it('uses a sanitized non-zero failure path', async () => {
    const harness = createHarness({ closeHttpImmediately: true });
    const secret = 'redis://user:password@redis.internal:6379';
    harness.queue.beginWorkerDrain.mockRejectedValue(new Error(secret));

    await harness.coordinator.handleSignal('SIGTERM');

    expect(harness.processTarget.exit).toHaveBeenCalledWith(1);
    expect(harness.events()).toContain(LIFECYCLE_EVENTS.failed);
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(
      secret,
    );
  });

  it.each([
    ['worker drain', 'worker'],
    ['HTTP close', 'http'],
  ] as const)(
    'observes an immediate %s rejection while HTTP work is active',
    async (_label, failureSource) => {
      const secret = 'postgresql://owner:secret@database.internal/moazez';
      const harness = createHarness({
        closeHttpErrorImmediately:
          failureSource === 'http' ? new Error(secret) : undefined,
      });
      harness.lifecycle.tryAdmit('http');
      if (failureSource === 'worker') {
        harness.queue.beginWorkerDrain.mockRejectedValue(new Error(secret));
      }
      const processFailures = captureProcessFailures();

      try {
        await harness.coordinator.handleSignal('SIGTERM');
        await nextTurn();
      } finally {
        processFailures.dispose();
      }

      expect(harness.processTarget.exit).toHaveBeenCalledWith(1);
      expect(harness.logger.error).toHaveBeenCalledTimes(1);
      expect(harness.events()).toContain(LIFECYCLE_EVENTS.failed);
      expect(harness.events()).not.toContain(LIFECYCLE_EVENTS.completed);
      expect(processFailures.unhandledRejections).toEqual([]);
      expect(processFailures.uncaughtExceptions).toEqual([]);
      expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(
        secret,
      );
    },
  );
});

function createHarness(
  options: {
    closeHttpImmediately?: boolean;
    closeHttpErrorImmediately?: Error;
    clock?: NonNullable<GracefulShutdownDependencies['clock']>;
  } = {},
) {
  const lifecycle = new ApplicationLifecycleState();
  const httpClose = deferred<void>();
  const httpServer = {
    close: jest.fn((callback: (error?: Error) => void) => {
      if (options.closeHttpErrorImmediately) {
        callback(options.closeHttpErrorImmediately);
      } else if (options.closeHttpImmediately) callback();
      else void httpClose.promise.then(() => callback());
    }),
  };
  const app = { close: jest.fn().mockResolvedValue(undefined) };
  const queue = {
    beginWorkerDrain: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = {
    disconnectSocketsForShutdown: jest.fn().mockResolvedValue(undefined),
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };
  const processTarget = new TestProcess();
  const coordinator = new GracefulShutdownCoordinator({
    app,
    httpServer:
      httpServer as unknown as GracefulShutdownDependencies['httpServer'],
    lifecycle,
    queue,
    realtime,
    timeoutMs: 15_000,
    logger,
    processTarget,
    clock: options.clock,
  });

  return {
    app,
    coordinator,
    events: () =>
      [...logger.log.mock.calls, ...logger.error.mock.calls].map(
        ([entry]) => entry.event as string,
      ),
    httpClose,
    httpServer,
    lifecycle,
    logger,
    processTarget,
    queue,
    realtime,
  };
}

class TestProcess extends EventEmitter {
  exitCode?: string | number | null;
  readonly exit = jest.fn((_code: number): void => undefined);

  override on(signal: SupportedShutdownSignal, listener: () => void): this {
    return super.on(signal, listener);
  }

  override off(signal: SupportedShutdownSignal, listener: () => void): this {
    return super.off(signal, listener);
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  assertion();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function captureProcessFailures(): {
  unhandledRejections: unknown[];
  uncaughtExceptions: Error[];
  dispose(): void;
} {
  const unhandledRejections: unknown[] = [];
  const uncaughtExceptions: Error[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandledRejections.push(reason);
  };
  const onUncaughtException = (error: Error): void => {
    uncaughtExceptions.push(error);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtExceptionMonitor', onUncaughtException);

  return {
    unhandledRejections,
    uncaughtExceptions,
    dispose: () => {
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtExceptionMonitor', onUncaughtException);
    },
  };
}

function deadlineHarness(): {
  clock: NonNullable<GracefulShutdownDependencies['clock']>;
  timer: NodeJS.Timeout & { unref: jest.Mock };
  setTimeout: jest.Mock;
  clearTimeout: jest.Mock;
  fire(): void;
} {
  let callback: (() => void) | undefined;
  const timer = {
    unref: jest.fn(),
  } as unknown as NodeJS.Timeout & { unref: jest.Mock };
  const setTimeout = jest.fn((next: () => void) => {
    callback = next;
    return timer;
  });
  const clearTimeout = jest.fn();

  return {
    clock: {
      now: () => 0,
      setTimeout,
      clearTimeout,
    },
    timer,
    setTimeout,
    clearTimeout,
    fire: () => {
      if (!callback) throw new Error('Deadline callback was not registered');
      callback();
    },
  };
}
