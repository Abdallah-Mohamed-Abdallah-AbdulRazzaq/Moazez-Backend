import {
  DashboardDataMode,
  DashboardFreshnessMetadataDto,
} from '../dto/dashboard-metadata.dto';

export function dashboardFreshness(
  dataMode: DashboardDataMode,
): DashboardFreshnessMetadataDto {
  return {
    dataMode,
    cacheStatus: 'not_used',
    realtimeStatus: 'not_used',
  };
}
