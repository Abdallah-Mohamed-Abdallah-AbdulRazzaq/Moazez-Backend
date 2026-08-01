export const OPERATIONAL_DEPENDENCY_TIMEOUT_MS = 750;

interface ProbeClock {
  setTimeout(callback: () => void, milliseconds: number): NodeJS.Timeout;
  clearTimeout(timer: NodeJS.Timeout): void;
}

const defaultClock: ProbeClock = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class BoundedProbeExecutor {
  private readonly active = new Map<string, Promise<boolean>>();

  constructor(
    private readonly timeoutMs = OPERATIONAL_DEPENDENCY_TIMEOUT_MS,
    private readonly clock: ProbeClock = defaultClock,
  ) {}

  run(key: string, operation: () => Promise<void>): Promise<boolean> {
    let flight = this.active.get(key);
    if (!flight) {
      flight = Promise.resolve()
        .then(operation)
        .then(
          () => true,
          () => false,
        );
      this.active.set(key, flight);
      void flight.then(() => {
        if (this.active.get(key) === flight) {
          this.active.delete(key);
        }
      });
    }

    return this.awaitWithinDeadline(flight);
  }

  private async awaitWithinDeadline(flight: Promise<boolean>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        flight,
        new Promise<boolean>((resolve) => {
          timer = this.clock.setTimeout(
            () => resolve(false),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) this.clock.clearTimeout(timer);
    }
  }
}
