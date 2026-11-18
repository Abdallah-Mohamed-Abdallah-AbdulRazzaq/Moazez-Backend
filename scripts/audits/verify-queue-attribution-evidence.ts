import { createHash } from 'node:crypto';
import {
  CONSUMER_REGISTERED,
  CORE_ATTRIBUTION_QUEUES,
  isCoreAttributionQueue,
  LEASE_ACQUIRED,
} from '../../src/infrastructure/queue/queue-attribution.events';

const MAX_ENTRIES = 500;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EVENT_FIELDS = new Set([
  'event',
  'schema_version',
  'role',
  'queue',
  'worker_session_id',
  'observed_at_utc',
]);

export interface QueueEvidenceScope {
  projectId: string;
  location: string;
  workerPool: string;
  revision: string;
  startUtc: string;
  endUtc: string;
  queueDatabase: 0;
}

interface WorkerBinding {
  projectId: string;
  location: string;
  workerPool: string;
  revision: string;
  instanceSha256: string;
  queue: (typeof CORE_ATTRIBUTION_QUEUES)[number];
  sessionId: string;
}

interface Observation {
  binding: WorkerBinding;
  observedAtUtc: string;
  loggedAtUtc: string;
  attemptId?: string;
}

export function verifyQueueAttributionEvidence(
  response: unknown,
  scope: QueueEvidenceScope,
) {
  const start = Date.parse(scope.startUtc);
  const end = Date.parse(scope.endUtc);
  if (
    ![scope.projectId, scope.location, scope.workerPool, scope.revision].every(
      (value) => typeof value === 'string' && value.trim().length > 0,
    ) ||
    scope.queueDatabase !== 0 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end
  ) {
    return { result: 'NOT_VERIFIED', reason: 'INVALID_SCOPE' } as const;
  }

  if (!isRecord(response)) {
    return { result: 'NOT_VERIFIED', reason: 'INVALID_RESPONSE' } as const;
  }
  const entries = response.entries ?? [];
  if (
    (response.nextPageToken !== undefined && response.nextPageToken !== '') ||
    !Array.isArray(entries) ||
    entries.length > MAX_ENTRIES
  ) {
    return {
      result: 'NOT_VERIFIED',
      reason: 'INCOMPLETE_OR_INVALID_PAGE',
    } as const;
  }

  const registrations = new Map<string, Observation>();
  const leases = new Map<string, Observation>();
  for (const entry of entries) {
    const observation = readObservation(entry, scope, start, end);
    if (!observation) {
      return {
        result: 'NOT_VERIFIED',
        reason: 'EVENT_OR_PLATFORM_BINDING_INVALID',
      } as const;
    }

    const index = observation.attemptId ? leases : registrations;
    const id = observation.attemptId ?? observation.binding.sessionId;
    const existing = index.get(id);
    if (
      existing &&
      (bindingKey(existing.binding) !== bindingKey(observation.binding) ||
        existing.observedAtUtc !== observation.observedAtUtc)
    ) {
      return {
        result: 'NOT_VERIFIED',
        reason: 'CONFLICTING_EVENT_IDENTITY',
      } as const;
    }
    if (!existing) index.set(id, observation);
  }

  for (const lease of leases.values()) {
    const registration = registrations.get(lease.binding.sessionId);
    if (
      !registration ||
      bindingKey(registration.binding) !== bindingKey(lease.binding)
    ) {
      return {
        result: 'NOT_VERIFIED',
        reason: 'LEASE_WITHOUT_MATCHING_REGISTRATION',
      } as const;
    }
  }

  const queues = CORE_ATTRIBUTION_QUEUES.map((queue) => ({
    queue,
    registrations: [...registrations.values()].filter(
      (event) => event.binding.queue === queue,
    ).length,
    acquisitions: [...leases.values()].filter(
      (event) => event.binding.queue === queue,
    ).length,
  }));
  if (
    queues.some(
      ({ registrations, acquisitions }) =>
        registrations === 0 || acquisitions === 0,
    )
  ) {
    return {
      result: 'NOT_VERIFIED',
      reason: 'OBSERVATION_MISSING',
      queues,
    } as const;
  }

  return {
    result: 'PASS_SCOPED_OBSERVED_ATTRIBUTION',
    queues,
    registrations: [...registrations.values()],
    leases: [...leases.values()],
  } as const;
}

function readObservation(
  entry: unknown,
  scope: QueueEvidenceScope,
  start: number,
  end: number,
): Observation | undefined {
  if (!isRecord(entry) || !isRecord(entry.resource) || !isRecord(entry.labels))
    return;
  const labels = entry.resource.labels;
  const instanceId = entry.labels.instanceId;
  const loggedAtUtc = entry.timestamp;
  if (
    entry.resource.type !== 'cloud_run_worker_pool' ||
    entry.logName !==
      'projects/' + scope.projectId + '/logs/run.googleapis.com%2Fstdout' ||
    !isRecord(labels) ||
    labels.project_id !== scope.projectId ||
    labels.location !== scope.location ||
    labels.worker_pool_name !== scope.workerPool ||
    labels.revision_name !== scope.revision ||
    typeof instanceId !== 'string' ||
    instanceId.trim().length === 0 ||
    instanceId.length > 256 ||
    typeof loggedAtUtc !== 'string' ||
    !inWindow(loggedAtUtc, start, end)
  )
    return;

  const event = entry.jsonPayload;
  if (
    !isRecord(event) ||
    (event.event !== CONSUMER_REGISTERED && event.event !== LEASE_ACQUIRED) ||
    event.schema_version !== 1 ||
    event.role !== 'core-worker' ||
    !isCoreAttributionQueue(event.queue) ||
    !isUuid(event.worker_session_id) ||
    typeof event.observed_at_utc !== 'string' ||
    !UTC.test(event.observed_at_utc) ||
    !inWindow(event.observed_at_utc, start, end)
  )
    return;

  const attemptId =
    event.event === LEASE_ACQUIRED ? event.lease_attempt_id : undefined;
  if (
    (event.event === LEASE_ACQUIRED && !isUuid(attemptId)) ||
    Object.keys(event).some(
      (field) =>
        !EVENT_FIELDS.has(field) &&
        !(field === 'lease_attempt_id' && event.event === LEASE_ACQUIRED),
    )
  )
    return;

  return {
    binding: {
      projectId: scope.projectId,
      location: scope.location,
      workerPool: scope.workerPool,
      revision: scope.revision,
      instanceSha256: createHash('sha256')
        .update(instanceId, 'utf8')
        .digest('hex'),
      queue: event.queue,
      sessionId: event.worker_session_id,
    },
    observedAtUtc: event.observed_at_utc,
    loggedAtUtc,
    ...(isUuid(attemptId) ? { attemptId } : {}),
  };
}

function bindingKey(binding: WorkerBinding): string {
  return JSON.stringify(binding);
}

function inWindow(value: string, start: number, end: number): boolean {
  const time = Date.parse(value);
  return time >= start && time < end;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
