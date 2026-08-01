export const OPERATIONAL_PROBE_ROLES = [
  'api',
  'core-worker',
  'media-worker',
] as const;

export type OperationalProbeRole = (typeof OPERATIONAL_PROBE_ROLES)[number];

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
  | 'core-consumers'
  | 'media-consumers'
  | 'ffprobe'
  | 'temporary-disk';

export interface OperationalRoleDependencyManifest {
  role: OperationalProbeRole;
  readiness: readonly OperationalDependencyId[];
  assignedConsumers: readonly string[];
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
  'learning-media-cleanup',
]);

export function createOperationalRoleManifests(
  policy: OperationalRolePolicy = CURRENT_OPERATIONAL_ROLE_POLICY,
): Readonly<Record<OperationalProbeRole, OperationalRoleDependencyManifest>> {
  const apiDependencies: OperationalDependencyId[] = ['prisma', 'queue-redis'];
  if (policy.storageRequiredForApi) apiDependencies.push('storage');
  if (policy.realtimeEnabled) {
    apiDependencies.push(
      'realtime-adapter-redis',
      'realtime-state-store-redis',
    );
  }
  const coreDependencies: readonly OperationalDependencyId[] = [
    'prisma',
    'queue-redis',
    'core-consumers',
  ];
  const mediaDependencies: readonly OperationalDependencyId[] = [
    'prisma',
    'queue-redis',
    'storage',
    'media-consumers',
    'ffprobe',
    'temporary-disk',
  ];

  return Object.freeze({
    api: Object.freeze({
      role: 'api',
      readiness: Object.freeze(apiDependencies),
      assignedConsumers: Object.freeze([]),
      requiresVerifiedMediaRuntime: false,
    }),
    'core-worker': Object.freeze({
      role: 'core-worker',
      readiness: Object.freeze(coreDependencies),
      assignedConsumers: CORE_WORKER_ASSIGNED_CONSUMERS,
      requiresVerifiedMediaRuntime: false,
    }),
    'media-worker': Object.freeze({
      role: 'media-worker',
      readiness: Object.freeze(mediaDependencies),
      assignedConsumers: MEDIA_WORKER_ASSIGNED_CONSUMERS,
      requiresVerifiedMediaRuntime: true,
    }),
  });
}

export const OPERATIONAL_ROLE_MANIFESTS = Symbol('OPERATIONAL_ROLE_MANIFESTS');
