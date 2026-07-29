import { BoundedProbeExecutor } from './bounded-probe-executor';

describe('BoundedProbeExecutor', () => {
  it('single-flights concurrent checks and clears every caller deadline', async () => {
    const clock = createClock();
    const operation = deferred<void>();
    const executor = new BoundedProbeExecutor(100, clock);
    const check = jest.fn(() => operation.promise);

    const first = executor.run('redis', check);
    const second = executor.run('redis', check);

    expect(first).not.toBe(second);
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);
    operation.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(clock.clearTimeout).toHaveBeenCalledTimes(2);
  });

  it('retains a timed-out underlying flight until late rejection and then recovers', async () => {
    const clock = createClock();
    const operation = deferred<void>();
    const executor = new BoundedProbeExecutor(100, clock);
    const recovered = jest.fn().mockResolvedValue(undefined);
    const check = jest
      .fn<Promise<void>, []>()
      .mockReturnValueOnce(operation.promise)
      .mockImplementation(recovered);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const first = executor.run('storage', check);
      await Promise.resolve();
      clock.fireNext();
      await expect(first).resolves.toBe(false);

      const second = executor.run('storage', check);
      const third = executor.run('storage', check);
      await Promise.resolve();
      expect(check).toHaveBeenCalledTimes(1);
      clock.fireNext();
      clock.fireNext();
      await expect(Promise.all([second, third])).resolves.toEqual([
        false,
        false,
      ]);

      operation.reject(new Error('storage://user:secret@internal'));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(check).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);

      const recovery = executor.run('storage', check);
      await expect(recovery).resolves.toBe(true);
      expect(check).toHaveBeenCalledTimes(2);
      expect(recovered).toHaveBeenCalledTimes(1);
      expect(clock.clearTimeout).toHaveBeenCalledTimes(4);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

function createClock(): {
  setTimeout: jest.Mock;
  clearTimeout: jest.Mock;
  fireNext(): void;
} {
  const callbacks: Array<() => void> = [];
  return {
    setTimeout: jest.fn((next: () => void) => {
      callbacks.push(next);
      return {} as NodeJS.Timeout;
    }),
    clearTimeout: jest.fn(),
    fireNext: () => {
      const callback = callbacks.shift();
      if (!callback) throw new Error('timeout callback missing');
      callback();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
