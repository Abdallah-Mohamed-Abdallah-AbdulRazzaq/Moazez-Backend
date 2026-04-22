import { PlacementTestStatus } from '@prisma/client';

export const PLACEMENT_TEST_STATUS_API_VALUES = [
  'scheduled',
  'completed',
  'failed',
  'cancelled',
  'rescheduled',
] as const;

export type PlacementTestStatusApiValue =
  (typeof PLACEMENT_TEST_STATUS_API_VALUES)[number];

export function mapPlacementTestStatusFromApi(
  value: PlacementTestStatusApiValue,
): PlacementTestStatus {
  switch (value) {
    case 'scheduled':
      return PlacementTestStatus.SCHEDULED;
    case 'completed':
      return PlacementTestStatus.COMPLETED;
    case 'failed':
      return PlacementTestStatus.FAILED;
    case 'cancelled':
      return PlacementTestStatus.CANCELLED;
    case 'rescheduled':
      return PlacementTestStatus.RESCHEDULED;
  }
}

export function mapPlacementTestStatusToApi(
  value: PlacementTestStatus,
): PlacementTestStatusApiValue {
  switch (value) {
    case PlacementTestStatus.SCHEDULED:
      return 'scheduled';
    case PlacementTestStatus.COMPLETED:
      return 'completed';
    case PlacementTestStatus.FAILED:
      return 'failed';
    case PlacementTestStatus.CANCELLED:
      return 'cancelled';
    case PlacementTestStatus.RESCHEDULED:
      return 'rescheduled';
  }
}
