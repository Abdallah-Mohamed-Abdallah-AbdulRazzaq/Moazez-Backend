export const RUNTIME_ROLES = [
  'api',
  'core-worker',
  'media-worker',
  'maintenance-scheduler',
] as const;

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];

export const RUNTIME_ROLE = Symbol('RUNTIME_ROLE');
