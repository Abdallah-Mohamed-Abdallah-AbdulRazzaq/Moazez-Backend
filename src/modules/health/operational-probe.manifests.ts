import type { BullmqRepeatRegistration } from '../../infrastructure/queue/bullmq.service';
import {
  DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
  DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
  DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID,
  DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN,
} from '../dismissal/requests/domain/dismissal-request-expiry.constants';
import {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LEARNING_MEDIA_DISCOVERY_JOB_ID,
  LEARNING_MEDIA_DISCOVERY_JOB_NAME,
} from '../files/uploads/domain/learning-media-cleanup.constants';
import { LEARNING_MEDIA_CLEANUP_INTERVAL_MS } from '../files/uploads/domain/learning-media.constants';
import {
  BRANDING_LOGO_CLEANUP_QUEUE,
  BRANDING_LOGO_RECONCILE_INTERVAL_MS,
  BRANDING_LOGO_RECONCILE_JOB,
} from '../settings/branding/domain/branding-logo.constants';
import { RUNTIME_ROLES, type RuntimeRole } from '../../runtime/runtime-role';

export const OPERATIONAL_PROBE_ROLES = RUNTIME_ROLES;
export type OperationalProbeRole = RuntimeRole;

export const OPERATIONAL_PROBE_KINDS = [
  'startup',
  'liveness',
  'readiness',
] as const;

export type OperationalProbeKind = (typeof OPERATIONAL_PROBE_KINDS)[number];

export type OperationalDependencyId =
  | 'prisma'
  | 'queue-redis'
  | 'storage'
  | 'realtime-adapter-redis'
  | 'realtime-state-store-redis'
  | 'realtime-emitter-redis'
  | 'core-consumers'
  | 'media-consumers'
  | 'schedule-registrations'
  | 'ffprobe'
  | 'temporary-disk'
  | 'firebase';

export interface OperationalRoleDependencyManifest {
  role: OperationalProbeRole;
  readiness: readonly OperationalDependencyId[];
  assignedConsumers: readonly string[];
  assignedSchedules: readonly BullmqRepeatRegistration[];
  requiresVerifiedMediaRuntime: boolean;
}

export interface OperationalRolePolicy {
  realtimeEnabled: boolean;
  storageRequiredForApi: boolean;
}

export const CURRENT_OPERATIONAL_ROLE_POLICY: OperationalRolePolicy =
  Object.freeze({
    realtimeEnabled: true,
    storageRequiredForApi: true,
  });

export const CORE_WORKER_ASSIGNED_CONSUMERS = Object.freeze([
  'communication-notifications',
  'communication-notification-push',
  'school-email-delivery',
  'files-imports',
  'dismissal-request-expiry',
  'settings-branding-logo-cleanup',
]);

export const MEDIA_WORKER_ASSIGNED_CONSUMERS = Object.freeze([
  LEARNING_MEDIA_CLEANUP_QUEUE,
]);

export const MAINTENANCE_SCHEDULE_REGISTRATIONS = Object.freeze([
  Object.freeze({
    queueName: DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
    jobName: DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
    jobId: DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID,
    pattern: DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN,
  }),
  Object.freeze({
    queueName: LEARNING_MEDIA_CLEANUP_QUEUE,
    jobName: LEARNING_MEDIA_DISCOVERY_JOB_NAME,
    jobId: LEARNING_MEDIA_DISCOVERY_JOB_ID,
    every: LEARNING_MEDIA_CLEANUP_INTERVAL_MS,
  }),
  Object.freeze({
    queueName: BRANDING_LOGO_CLEANUP_QUEUE,
    jobName: BRANDING_LOGO_RECONCILE_JOB,
    jobId: BRANDING_LOGO_RECONCILE_JOB,
    every: BRANDING_LOGO_RECONCILE_INTERVAL_MS,
  }),
] satisfies BullmqRepeatRegistration[]);

const NO_CONSUMERS = Object.freeze([]) as readonly string[];
const NO_SCHEDULES = Object.freeze(
  [],
) as readonly BullmqRepeatRegistration[];

export function createOperationalRoleManifests(
  policy: OperationalRolePolicy = CURRENT_OPERATIONAL_ROLE_POLICY,
): Readonly<Record<OperationalProbeRole, OperationalRoleDependencyManifest>> {
  const apiDependencies: OperationalDependencyId[] = [
    'prisma',
    'queue-redis',
  ];
  if (policy.storageRequiredForApi) apiDependencies.push('storage');
  if (policy.realtimeEnabled) {
    apiDependencies.push(
      'realtime-adapter-redis',
      'realtime-state-store-redis',
    );
  }
  apiDependencies.push('ffprobe', 'temporary-disk');

  return Object.freeze({
    api: Object.freeze({
      role: 'api',
      readiness: Object.freeze(apiDependencies),
      assignedConsumers: NO_CONSUMERS,
      assignedSchedules: NO_SCHEDULES,
      requiresVerifiedMediaRuntime: true,
    }),
    'core-worker': Object.freeze({
      role: 'core-worker',
      readiness: Object.freeze([
        'prisma',
        'queue-redis',
        'storage',
        'core-consumers',
        'realtime-emitter-redis',
        'firebase',
      ] satisfies OperationalDependencyId[]),
      assignedConsumers: CORE_WORKER_ASSIGNED_CONSUMERS,
      assignedSchedules: NO_SCHEDULES,
      requiresVerifiedMediaRuntime: false,
    }),
    'media-worker': Object.freeze({
      role: 'media-worker',
      readiness: Object.freeze([
        'prisma',
        'queue-redis',
        'storage',
        'media-consumers',
      ] satisfies OperationalDependencyId[]),
      assignedConsumers: MEDIA_WORKER_ASSIGNED_CONSUMERS,
      assignedSchedules: NO_SCHEDULES,
      requiresVerifiedMediaRuntime: false,
    }),
    'maintenance-scheduler': Object.freeze({
      role: 'maintenance-scheduler',
      readiness: Object.freeze([
        'queue-redis',
        'schedule-registrations',
      ] satisfies OperationalDependencyId[]),
      assignedConsumers: NO_CONSUMERS,
      assignedSchedules: MAINTENANCE_SCHEDULE_REGISTRATIONS,
      requiresVerifiedMediaRuntime: false,
    }),
  });
}

export const OPERATIONAL_ROLE_MANIFESTS = Symbol('OPERATIONAL_ROLE_MANIFESTS');
