import type { PublicDismissalGateStatus } from '../../../dismissal/shared/dismissal.types';
import type { ParentSmartPickupRecentStatus } from './parent-smart-pickup-recent-calls.dto';

export type ParentSmartPickupZoneSource =
  | 'settings'
  | 'school_profile'
  | 'default';

export class ParentSmartPickupStatusDto {
  enabled!: boolean;
  configured!: boolean;
  requestWindowOpen!: boolean;
  canRequestNow!: boolean;
  reasons!: string[];
}

export class ParentSmartPickupSchoolZoneDto {
  latitude!: number | null;
  longitude!: number | null;
  radiusMeters!: number;
  label!: string | null;
  source!: ParentSmartPickupZoneSource;
}

export class ParentSmartPickupRequestWindowDto {
  startLocal!: string | null;
  endLocal!: string | null;
  timezone!: string;
  serverNowLocal!: string;
}

export class ParentSmartPickupPoliciesDto {
  requirePickupCode!: boolean;
  allowDelegatePickup!: boolean;
  allowParentCancelBeforeCalled!: boolean;
}

export class ParentSmartPickupPolicyRequestWindowDto {
  start!: string | null;
  end!: string | null;
  timezone!: string;
  isOpenNow!: boolean;
}

export class ParentSmartPickupPolicyDto {
  geofenceRequired!: boolean;
  requestWindow!: ParentSmartPickupPolicyRequestWindowDto;
  pickupCodeRequired!: boolean;
  parentCancelBeforeCalledAllowed!: boolean;
  delegatePickupAllowed!: boolean;
}

export class ParentSmartPickupSchoolDto {
  name!: string | null;
}

export type ParentSmartPickupChildBlockedReason =
  | null
  | 'dismissal_disabled'
  | 'outside_request_window'
  | 'missing_school_location'
  | 'no_active_enrollment'
  | 'guardian_not_allowed'
  | 'active_request_exists';

export class ParentSmartPickupChildActiveRequestGateDto {
  id!: string;
  code!: string;
  name!: string;
}

export class ParentSmartPickupChildActiveRequestPickupDto {
  codeRequired!: boolean;
  codeIssued!: boolean;
  codeIssuedAt!: string | null;
}

export class ParentSmartPickupChildActiveRequestDto {
  id!: string;
  status!: ParentSmartPickupRecentStatus;
  isActive!: true;
  isTerminal!: false;
  canCancel!: boolean;
  canTrack!: boolean;
  requestedAt!: string;
  gate!: ParentSmartPickupChildActiveRequestGateDto | null;
  pickup!: ParentSmartPickupChildActiveRequestPickupDto;
}

export class ParentSmartPickupChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
  canPickup!: boolean;
  pickupEligible!: boolean;
  eligibilityReasons!: string[];
  canRequestPickup!: boolean;
  blockedReason!: ParentSmartPickupChildBlockedReason;
  activeRequest!: ParentSmartPickupChildActiveRequestDto | null;
}

export class ParentSmartPickupGateDto {
  id!: string;
  code!: string;
  name!: string;
  campus!: string | null;
  status!: PublicDismissalGateStatus;
  isActive!: boolean;
  sortOrder!: number;
}

export class ParentSmartPickupSummaryDto {
  childCount!: number;
  eligibleChildCount!: number;
  availableGateCount!: number;
}

export class ParentSmartPickupReadinessResponseDto {
  enabled!: boolean;
  school!: ParentSmartPickupSchoolDto;
  policy!: ParentSmartPickupPolicyDto;
  status!: ParentSmartPickupStatusDto;
  schoolZone!: ParentSmartPickupSchoolZoneDto;
  requestWindow!: ParentSmartPickupRequestWindowDto;
  policies!: ParentSmartPickupPoliciesDto;
  children!: ParentSmartPickupChildDto[];
  gates!: ParentSmartPickupGateDto[];
  summary!: ParentSmartPickupSummaryDto;
}
