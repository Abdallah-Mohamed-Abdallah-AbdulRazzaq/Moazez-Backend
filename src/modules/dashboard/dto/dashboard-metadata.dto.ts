export const DASHBOARD_DATA_MODES = [
  'static_catalog',
  'request_time_snapshot',
  'persisted_user_data',
  'cached',
  'realtime',
] as const;

export type DashboardDataMode = (typeof DASHBOARD_DATA_MODES)[number];

export class DashboardFreshnessMetadataDto {
  dataMode!: DashboardDataMode;
  cacheStatus!: 'not_used' | 'hit' | 'miss';
  realtimeStatus!: 'not_used' | 'push';
}

export type DashboardCapabilityState =
  | 'available'
  | 'foundation'
  | 'snapshot_only'
  | 'persisted'
  | 'integration_deferred'
  | 'deferred'
  | 'out_of_scope_v1';
