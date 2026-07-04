import type { PublicDismissalGateStatus } from '../../../dismissal/shared/dismissal.types';

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

export class ParentSmartPickupChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
  canPickup!: boolean;
  pickupEligible!: boolean;
  eligibilityReasons!: string[];
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
  status!: ParentSmartPickupStatusDto;
  schoolZone!: ParentSmartPickupSchoolZoneDto;
  requestWindow!: ParentSmartPickupRequestWindowDto;
  policies!: ParentSmartPickupPoliciesDto;
  children!: ParentSmartPickupChildDto[];
  gates!: ParentSmartPickupGateDto[];
  summary!: ParentSmartPickupSummaryDto;
}
