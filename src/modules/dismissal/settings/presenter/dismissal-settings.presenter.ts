import { DismissalSettingsResponseDto } from '../dto/dismissal-settings.dto';
import {
  DismissalSchoolProfileLocationRecord,
  DismissalSettingsRecord,
} from '../infrastructure/dismissal-settings.repository';
import { presentGateStatus } from '../../shared/dismissal.types';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const DEFAULT_ALLOWED_RADIUS_METERS = 150;
const DEFAULT_DELAY_THRESHOLD_MINUTES = 15;
const DEFAULT_URGENT_THRESHOLD_MINUTES = 30;

function toNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value ? value.toNumber() : null;
}

function locationLabel(
  profile: DismissalSchoolProfileLocationRecord | null,
): string | null {
  return profile?.mapPlaceLabel ?? profile?.formattedAddress ?? null;
}

export function presentDismissalSettings(
  settings: DismissalSettingsRecord | null,
  profile: DismissalSchoolProfileLocationRecord | null,
): DismissalSettingsResponseDto {
  const settingsLatitude = toNumber(settings?.schoolLatitude);
  const settingsLongitude = toNumber(settings?.schoolLongitude);
  const profileLatitude = toNumber(profile?.latitude);
  const profileLongitude = toNumber(profile?.longitude);
  const hasSettingsCoordinates =
    settingsLatitude !== null && settingsLongitude !== null;
  const hasProfileCoordinates =
    profileLatitude !== null && profileLongitude !== null;

  const schoolZone = hasSettingsCoordinates
    ? {
        latitude: settingsLatitude,
        longitude: settingsLongitude,
        label: locationLabel(profile),
        source: 'settings' as const,
      }
    : hasProfileCoordinates
      ? {
          latitude: profileLatitude,
          longitude: profileLongitude,
          label: locationLabel(profile),
          source: 'school_profile' as const,
        }
      : {
          latitude: null,
          longitude: null,
          label: locationLabel(profile),
          source: 'default' as const,
        };

  const defaultGate =
    settings?.defaultGate && !settings.defaultGate.deletedAt
      ? {
          id: settings.defaultGate.id,
          code: settings.defaultGate.code,
          name: settings.defaultGate.name,
          status: presentGateStatus(settings.defaultGate.status),
        }
      : null;

  return {
    enabled: settings?.enabled ?? false,
    timezone: settings?.timezone ?? profile?.timezone ?? DEFAULT_TIMEZONE,
    schoolZone,
    allowedRadiusMeters:
      settings?.allowedRadiusMeters ?? DEFAULT_ALLOWED_RADIUS_METERS,
    requestWindow: {
      startLocal: settings?.requestWindowStartLocal ?? null,
      endLocal: settings?.requestWindowEndLocal ?? null,
    },
    thresholds: {
      delayMinutes:
        settings?.delayThresholdMinutes ?? DEFAULT_DELAY_THRESHOLD_MINUTES,
      urgentMinutes:
        settings?.urgentThresholdMinutes ?? DEFAULT_URGENT_THRESHOLD_MINUTES,
    },
    policies: {
      requirePickupCode: settings?.requirePickupCode ?? true,
      allowDelegatePickup: settings?.allowDelegatePickup ?? true,
      allowParentCancelBeforeCalled:
        settings?.allowParentCancelBeforeCalled ?? true,
    },
    defaultGate,
    configured: Boolean(settings),
    updatedAt: settings?.updatedAt.toISOString() ?? null,
  };
}
