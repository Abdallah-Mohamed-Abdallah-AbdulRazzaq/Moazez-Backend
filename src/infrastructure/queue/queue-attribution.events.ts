import type { Job, Processor } from 'bullmq';
import { randomUUID } from 'node:crypto';

export const CORE_ATTRIBUTION_QUEUES = [
  'communication-notifications',
  'communication-notification-push',
  'school-email-delivery',
] as const;

type AttributionQueue = (typeof CORE_ATTRIBUTION_QUEUES)[number];

export const CONSUMER_REGISTERED = 'queue.consumer.registered';
export const LEASE_ACQUIRED = 'queue.lease.acquired';

export function isCoreAttributionQueue(
  name: unknown,
): name is AttributionQueue {
  return CORE_ATTRIBUTION_QUEUES.some((queue) => queue === name);
}

interface AttributionFields {
  schema_version: 1;
  role: 'core-worker';
  queue: AttributionQueue;
  worker_session_id: string;
  observed_at_utc: string;
}

export type CoreQueueAttributionEvent = AttributionFields &
  (
    | { event: typeof CONSUMER_REGISTERED }
    | { event: typeof LEASE_ACQUIRED; lease_attempt_id: string }
  );

export function createCoreQueueAttribution<TData extends object, TResult>(
  queue: string,
  processor: Processor<TData, TResult, string>,
) {
  if (!isCoreAttributionQueue(queue)) return undefined;

  let sessionId: string | undefined;

  function emit(event: typeof CONSUMER_REGISTERED | typeof LEASE_ACQUIRED) {
    try {
      const fields: AttributionFields = {
        schema_version: 1,
        role: 'core-worker',
        queue: scopedQueue,
        worker_session_id: (sessionId ??= randomUUID()),
        observed_at_utc: new Date().toISOString(),
      };
      const record: CoreQueueAttributionEvent =
        event === LEASE_ACQUIRED
          ? { ...fields, event, lease_attempt_id: randomUUID() }
          : { ...fields, event };
      console.log(JSON.stringify(record));
    } catch {
      // Telemetry failures must not change the worker's execution.
    }
  }

  const scopedQueue = queue;
  function recordLease(job: Job<TData, TResult, string>, token?: string) {
    if (
      job.queueName === scopedQueue &&
      typeof token === 'string' &&
      token.length > 0 &&
      token !== '0' &&
      job.token === token
    ) {
      // The processor also receives jobs prefetched by moveToFinished.
      emit(LEASE_ACQUIRED);
    }
  }

  // BullMQ uses the processor's arity to decide whether to supply AbortSignal.
  const observedProcessor: Processor<TData, TResult, string> =
    processor.length >= 3
      ? (job, token, signal) => {
          recordLease(job, token);
          return processor(job, token, signal);
        }
      : (job, token) => {
          recordLease(job, token);
          return processor(job, token, undefined);
        };

  return {
    processor: observedProcessor,
    recordRegistration: () => emit(CONSUMER_REGISTERED),
  };
}
