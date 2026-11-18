import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import {
  type QueueEvidenceScope,
  verifyQueueAttributionEvidence,
} from '../../../scripts/audits/verify-queue-attribution-evidence';
import {
  CONSUMER_REGISTERED,
  CORE_ATTRIBUTION_QUEUES,
  type CoreQueueAttributionEvent,
  createCoreQueueAttribution,
  LEASE_ACQUIRED,
} from './queue-attribution.events';

const observedAtUtc = '2026-11-19T08:00:01.000Z';
const projectId = 'synthetic-project';
const instance = 'synthetic-platform-instance';
const scope: QueueEvidenceScope = {
  projectId,
  location: 'synthetic-region',
  workerPool: 'synthetic-core-worker',
  revision: 'synthetic-core-worker-revision',
  startUtc: '2026-11-19T08:00:00.000Z',
  endUtc: '2026-11-19T08:01:00.000Z',
  queueDatabase: 0,
};

function job(queueName: string, token?: string) {
  return {
    queueName,
    token,
    id: 'sensitive-job-id',
    data: { recipient: 'sensitive-recipient' },
  } as Job<object, string, string>;
}

function platformEntry(event: CoreQueueAttributionEvent) {
  return {
    logName: 'projects/' + projectId + '/logs/run.googleapis.com%2Fstdout',
    timestamp: observedAtUtc,
    resource: {
      type: 'cloud_run_worker_pool',
      labels: {
        project_id: projectId,
        location: scope.location,
        worker_pool_name: scope.workerPool,
        revision_name: scope.revision,
      },
    },
    labels: { instanceId: instance },
    jsonPayload: event,
  };
}

describe('A07 queue attribution', () => {
  let output: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(observedAtUtc) });
    output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function events(): CoreQueueAttributionEvent[] {
    return output.mock.calls.map(
      (args: unknown[]) =>
        JSON.parse(String(args[0])) as CoreQueueAttributionEvent,
    );
  }

  async function syntheticEntries() {
    for (const queue of CORE_ATTRIBUTION_QUEUES) {
      const capture = createCoreQueueAttribution(queue, () =>
        Promise.resolve('ok'),
      )!;
      capture.recordRegistration();
      await capture.processor(job(queue, 'lock-token'), 'lock-token');
      // BullMQ's prefetched processor entry can use the same token.
      await capture.processor(job(queue, 'lock-token'), 'lock-token');
    }
    return events().map(platformEntry);
  }

  it('attributes three queues using the platform envelope, even with reordered and duplicate records', async () => {
    const entries = await syntheticEntries();
    const result = verifyQueueAttributionEvidence(
      { entries: [...entries, entries[1]].reverse() },
      scope,
    );
    expect(result.result).toBe('PASS_SCOPED_OBSERVED_ATTRIBUTION');
    if (result.result !== 'PASS_SCOPED_OBSERVED_ATTRIBUTION')
      throw new Error('Missing attribution');

    expect(result.queues).toEqual(
      CORE_ATTRIBUTION_QUEUES.map((queue) => ({
        queue,
        registrations: 1,
        acquisitions: 2,
      })),
    );
    const instanceSha256 = createHash('sha256').update(instance).digest('hex');
    for (const lease of result.leases) {
      expect(lease.binding).toEqual(
        expect.objectContaining({
          projectId,
          revision: scope.revision,
          instanceSha256,
        }),
      );
      expect(lease.binding).toEqual(
        result.registrations.find(
          ({ binding }) => binding.queue === lease.binding.queue,
        )?.binding,
      );
    }
    expect(new Set(result.leases.map((lease) => lease.attemptId)).size).toBe(6);
    const serialized = JSON.stringify({ records: events(), result });
    for (const privateValue of [
      'lock-token',
      'sensitive-job-id',
      'sensitive-recipient',
      instance,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('refuses missing or mismatched platform revision and instance', async () => {
    const entries = await syntheticEntries();
    const [registration, lease] = entries;
    for (const revision_name of [undefined, 'previous-revision']) {
      const invalid = {
        ...lease,
        resource: {
          ...lease.resource,
          labels: { ...lease.resource.labels, revision_name },
        },
      };
      expect(
        verifyQueueAttributionEvidence(
          { entries: [registration, invalid] },
          scope,
        ),
      ).toMatchObject({
        result: 'NOT_VERIFIED',
        reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
      });
    }
    expect(
      verifyQueueAttributionEvidence(
        { entries: [registration, { ...lease, labels: {} }] },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
    });
    expect(
      verifyQueueAttributionEvidence(
        {
          entries: [
            registration,
            { ...lease, labels: { instanceId: 'unmatched-instance' } },
          ],
        },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'LEASE_WITHOUT_MATCHING_REGISTRATION',
    });
  });

  it('refuses an unexpected project, region, worker pool, or log stream', async () => {
    const [entry] = await syntheticEntries();
    for (const field of ['project_id', 'location', 'worker_pool_name']) {
      const unexpected = {
        ...entry,
        resource: {
          ...entry.resource,
          labels: { ...entry.resource.labels, [field]: 'unexpected' },
        },
      };
      expect(
        verifyQueueAttributionEvidence({ entries: [unexpected] }, scope),
      ).toMatchObject({
        result: 'NOT_VERIFIED',
        reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
      });
    }
    expect(
      verifyQueueAttributionEvidence(
        { entries: [{ ...entry, logName: 'unexpected' }] },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
    });
  });

  it('refuses incomplete pages, empty or partial coverage, and an unexpected event field', async () => {
    const entries = await syntheticEntries();
    expect(
      verifyQueueAttributionEvidence(
        { entries, nextPageToken: 'remaining' },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'INCOMPLETE_OR_INVALID_PAGE',
    });
    expect(
      verifyQueueAttributionEvidence(
        { entries: Array(501).fill(entries[0]) },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'INCOMPLETE_OR_INVALID_PAGE',
    });
    for (const only of [[], entries.slice(0, 3)]) {
      expect(
        verifyQueueAttributionEvidence({ entries: only }, scope),
      ).toMatchObject({
        result: 'NOT_VERIFIED',
        reason: 'OBSERVATION_MISSING',
      });
    }
    const [entry] = entries;
    expect(
      verifyQueueAttributionEvidence(
        {
          entries: [
            {
              ...entry,
              jsonPayload: { ...entry.jsonPayload, payload: 'unexpected' },
            },
          ],
        },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
    });
  });

  it('rejects out-of-window entries and conflicting attempt identities', async () => {
    const entries = await syntheticEntries();
    const [registration, lease] = entries;
    expect(
      verifyQueueAttributionEvidence(
        { entries: [registration, { ...lease, timestamp: scope.endUtc }] },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
    });
    expect(
      verifyQueueAttributionEvidence(
        {
          entries: [
            ...entries,
            { ...lease, labels: { instanceId: 'unmatched-instance' } },
          ],
        },
        scope,
      ),
    ).toMatchObject({
      result: 'NOT_VERIFIED',
      reason: 'CONFLICTING_EVENT_IDENTITY',
    });
  });

  it('records only recognized queues and a matching, nonzero token', async () => {
    const queue = CORE_ATTRIBUTION_QUEUES[0];
    const processor = jest.fn(() => Promise.resolve('ok'));
    expect(
      createCoreQueueAttribution('outside-scope', processor),
    ).toBeUndefined();
    const capture = createCoreQueueAttribution(queue, processor)!;
    capture.recordRegistration();
    await capture.processor(job(queue));
    await capture.processor(job(queue, '0'), '0');
    await capture.processor(job(queue, 'different'), 'lock-token');
    await capture.processor(job('wrong-queue', 'lock-token'), 'lock-token');
    expect(events().map((event) => event.event)).toEqual([CONSUMER_REGISTERED]);
    expect(processor).toHaveBeenCalledTimes(4);
  });

  it('preserves BullMQ signal detection and processor success and errors if logging fails', async () => {
    const queue = CORE_ATTRIBUTION_QUEUES[0];
    const token = 'lock-token';
    const signal = new AbortController().signal;
    const input = job(queue, token);
    const error = new Error('processor error');
    const forward = jest.fn(
      (
        _job: Job<object, string, string>,
        _token?: string,
        _signal?: AbortSignal,
      ) => Promise.resolve('original-result'),
    );
    const capture = createCoreQueueAttribution(queue, forward)!;
    expect(capture.processor.length).toBe(3);
    await expect(capture.processor(input, token, signal)).resolves.toBe(
      'original-result',
    );
    expect(forward).toHaveBeenCalledWith(input, token, signal);
    expect(events().map((event) => event.event)).toEqual([LEASE_ACQUIRED]);
    expect(
      createCoreQueueAttribution(queue, () => Promise.resolve())!.processor
        .length,
    ).toBeLessThan(3);

    output.mockImplementation(() => {
      throw new Error('stdout unavailable');
    });
    await expect(capture.processor(input, token, signal)).resolves.toBe(
      'original-result',
    );
    forward.mockRejectedValueOnce(error);
    await expect(capture.processor(input, token, signal)).rejects.toBe(error);
  });
});
