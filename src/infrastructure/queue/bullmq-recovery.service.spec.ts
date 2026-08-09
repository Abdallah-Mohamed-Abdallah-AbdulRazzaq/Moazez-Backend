import { BullmqService } from './bullmq.service';

type MutableService = Record<string, any>;

describe('BullmqService persisted-truth recovery', () => {
  const ensure = BullmqService.prototype.ensureJobFromPersistedTruth as any;

  it('requires a deterministic job ID', async () => {
    const service = recoveryHarness({});
    await expect(
      ensure.call(service, 'queue', 'job', { fresh: true }, { jobId: '' }),
    ).rejects.toThrow('queue_recovery_job_id_required');
  });

  it.each(['active', 'waiting', 'delayed', 'prioritized'])(
    'preserves %s work without removal or payload access',
    async (state) => {
      const existing = {
        getState: jest.fn().mockResolvedValue(state),
        get data(): never {
          throw new Error('existing Redis payload was accessed');
        },
      };
      const queue = queueHarness(existing);
      const service = recoveryHarness(queue);

      await expect(
        ensure.call(
          service,
          'queue',
          'job',
          { reconstructed: 'postgresql' },
          { jobId: 'domain-id' },
        ),
      ).resolves.toBe('preserved');
      expect(queue.remove).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(queue.client.set).not.toHaveBeenCalled();
    },
  );

  it.each(['completed', 'failed'])(
    'replaces a %s job under an owned bounded lock using only fresh data',
    async (state) => {
      const finished = { getState: jest.fn().mockResolvedValue(state) };
      const queue = queueHarness(finished);
      let removed = false;
      queue.getJob.mockImplementation(() =>
        Promise.resolve(removed ? null : finished),
      );
      queue.remove.mockImplementation(async () => {
        removed = true;
      });
      const service = recoveryHarness(queue);

      await expect(
        ensure.call(
          service,
          'queue',
          'job',
          { reconstructed: 'object-and-database-truth' },
          { jobId: 'domain-id', attempts: 3 },
        ),
      ).resolves.toBe('replaced');

      expect(queue.client.set).toHaveBeenCalledWith(
        'bull:queue:persisted-truth-replacement:domain-id',
        expect.any(String),
        'PX',
        30_000,
        'NX',
      );
      expect(queue.add).toHaveBeenCalledWith(
        'job',
        { reconstructed: 'object-and-database-truth' },
        { jobId: 'domain-id', attempts: 3 },
      );
      const lockToken = queue.client.set.mock.calls[0][1];
      expect(queue.client.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('get'"),
        1,
        'bull:queue:persisted-truth-replacement:domain-id',
        lockToken,
      );
    },
  );

  it('does not replace finished work when another reconciler owns the lock', async () => {
    const queue = queueHarness({
      getState: jest.fn().mockResolvedValue('failed'),
    });
    queue.client.set.mockResolvedValue(null);
    const service = recoveryHarness(queue);

    await expect(
      ensure.call(
        service,
        'queue',
        'job',
        { reconstructed: true },
        { jobId: 'domain-id' },
      ),
    ).resolves.toBe('replacement_contended');
    expect(queue.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('honors a persisted terminal decision before touching Redis', async () => {
    const queue = queueHarness(null);
    const service = recoveryHarness(queue);
    await expect(
      ensure.call(
        service,
        'queue',
        'job',
        { reconstructed: true },
        { jobId: 'domain-id' },
        false,
      ),
    ).resolves.toBe('not_required');
    expect(service.ensureCommandConnectionReady).not.toHaveBeenCalled();
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected Redis command failures', async () => {
    const queue = queueHarness(null);
    queue.getJob.mockRejectedValue(
      new Error('sensitive Redis connection detail'),
    );
    const service = recoveryHarness(queue);

    await expect(
      ensure.call(
        service,
        'queue',
        'job',
        { reconstructed: true },
        { jobId: 'domain-id' },
      ),
    ).rejects.toThrow('queue_recovery_command_failed');
  });
});

describe('BullmqService desired repeat restoration', () => {
  const register = BullmqService.prototype.registerRepeatJob as any;
  const restore = (BullmqService.prototype as any)
    .restoreDesiredRepeatRegistrations;
  const execute = (BullmqService.prototype as any).executeRepeatRestoration;

  it('retains a failed definition as desired but never active', async () => {
    const service: MutableService = {
      desiredRepeatRegistrations: new Map(),
      repeatRegistrations: new Map(),
      restoreDesiredRepeatRegistrations: jest
        .fn()
        .mockRejectedValue(new Error('queue_redis_unavailable')),
    };

    await expect(
      register.call(
        service,
        'queue',
        'reconcile',
        {},
        {
          jobId: 'reconcile',
          repeat: { every: 300_000 },
        },
      ),
    ).rejects.toThrow('queue_redis_unavailable');
    expect(service.desiredRepeatRegistrations.size).toBe(1);
    expect(service.repeatRegistrations.size).toBe(0);
  });

  it('serializes concurrent ready-event restoration flights', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service: MutableService = {
      isShuttingDown: false,
      repeatRestorationFlight: null,
      executeRepeatRestoration: jest.fn(() => pending),
      queueRedisUnavailable: () => new Error('queue_redis_unavailable'),
    };

    const first = restore.call(service);
    const second = restore.call(service);
    expect(second).toBe(first);
    expect(service.executeRepeatRestoration).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(service.repeatRestorationFlight).toBeNull();
  });

  it('restores current application definitions exactly once', async () => {
    const registration = {
      queueName: 'queue',
      jobName: 'reconcile',
      jobId: 'reconcile',
      every: 300_000,
    };
    const add = jest.fn().mockResolvedValue({ id: 'repeat' });
    const service: MutableService = {
      isShuttingDown: false,
      desiredRepeatRegistrations: new Map([
        [
          'queue:reconcile:reconcile',
          {
            registration,
            data: { currentDefinition: true },
            options: {
              jobId: 'reconcile',
              repeat: { every: 300_000 },
            },
          },
        ],
      ]),
      repeatRegistrations: new Map(),
      ensureCommandConnectionReady: jest.fn().mockResolvedValue(undefined),
      getQueue: jest.fn(() => ({ add })),
      queueRedisUnavailable: () => new Error('queue_redis_unavailable'),
      rethrowSanitizedQueueCommandError: (error: unknown) => {
        throw error;
      },
      queueConnectionWarningEmitted: true,
    };

    await execute.call(service);
    await execute.call(service);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'reconcile',
      { currentDefinition: true },
      { jobId: 'reconcile', repeat: { every: 300_000 } },
    );
    expect(
      service.repeatRegistrations.get('queue:reconcile:reconcile'),
    ).toEqual(registration);
  });
});

function recoveryHarness(queue: Record<string, any>): MutableService {
  return {
    ensureCommandConnectionReady: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn(() => queue),
    queueConnectionWarningEmitted: true,
    isQueueRedisAvailabilityError: jest.fn(() => false),
    queueRedisUnavailable: () => new Error('queue_redis_unavailable'),
  };
}

function queueHarness(existing: unknown): Record<string, any> {
  const client = {
    set: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
  };
  return {
    getJob: jest.fn().mockResolvedValue(existing),
    add: jest.fn().mockResolvedValue({ id: 'domain-id' }),
    remove: jest.fn().mockResolvedValue(undefined),
    client,
    toKey: jest.fn((suffix: string) => `bull:queue:${suffix}`),
  };
}
