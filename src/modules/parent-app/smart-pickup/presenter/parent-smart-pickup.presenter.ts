import { DismissalRequestStatus, StudentStatus } from '@prisma/client';
import { presentGateStatus } from '../../../dismissal/shared/dismissal.types';
import {
  ParentSmartPickupChildActiveRequestDto,
  ParentSmartPickupChildDto,
  ParentSmartPickupGateDto,
  ParentSmartPickupReadinessResponseDto,
  ParentSmartPickupZoneSource,
} from '../dto/parent-smart-pickup.dto';
import type {
  ParentSmartPickupActiveRequestRecord,
  ParentSmartPickupEnrollmentRecord,
  ParentSmartPickupGateRecord,
  ParentSmartPickupGuardianRecord,
  ParentSmartPickupSchoolProfileRecord,
  ParentSmartPickupSettingsRecord,
  ParentSmartPickupStudentLinkRecord,
} from '../infrastructure/parent-smart-pickup-read.adapter';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const DEFAULT_ALLOWED_RADIUS_METERS = 150;

export interface ParentSmartPickupWindowPresentation {
  requestWindowOpen: boolean;
  serverNowLocal: string;
}

export class ParentSmartPickupPresenter {
  static present(params: {
    settings: ParentSmartPickupSettingsRecord | null;
    schoolProfile: ParentSmartPickupSchoolProfileRecord | null;
    guardians: ParentSmartPickupGuardianRecord[];
    links: ParentSmartPickupStudentLinkRecord[];
    enrollments: ParentSmartPickupEnrollmentRecord[];
    gates: ParentSmartPickupGateRecord[];
    activeRequests: ParentSmartPickupActiveRequestRecord[];
    window: ParentSmartPickupWindowPresentation;
  }): ParentSmartPickupReadinessResponseDto {
    const settings = presentSettings(params.settings, params.schoolProfile);
    const hasZone =
      settings.schoolZone.latitude !== null &&
      settings.schoolZone.longitude !== null;
    const children = presentChildren({
      guardians: params.guardians,
      links: params.links,
      enrollments: params.enrollments,
      activeRequests: params.activeRequests,
      dismissalEnabled: settings.enabled,
      requestWindowOpen: params.window.requestWindowOpen,
      hasZone,
      pickupCodeRequired: settings.policies.requirePickupCode,
      parentCancelBeforeCalledAllowed:
        settings.policies.allowParentCancelBeforeCalled,
    });
    const gates = params.gates.map(presentGate);
    const eligibleChildCount = children.filter(
      (child) => child.pickupEligible,
    ).length;
    const reasons = readinessReasons({
      enabled: settings.enabled,
      configured: settings.configured,
      hasZone,
      requestWindowOpen: params.window.requestWindowOpen,
      eligibleChildCount,
      availableGateCount: gates.length,
    });

    return {
      enabled: settings.enabled,
      school: settings.school,
      policy: {
        geofenceRequired: true,
        requestWindow: {
          start: settings.requestWindow.startLocal,
          end: settings.requestWindow.endLocal,
          timezone: settings.timezone,
          isOpenNow: params.window.requestWindowOpen,
        },
        pickupCodeRequired: settings.policies.requirePickupCode,
        parentCancelBeforeCalledAllowed:
          settings.policies.allowParentCancelBeforeCalled,
        delegatePickupAllowed: settings.policies.allowDelegatePickup,
      },
      status: {
        enabled: settings.enabled,
        configured: settings.configured,
        requestWindowOpen: params.window.requestWindowOpen,
        canRequestNow: reasons.length === 0,
        reasons,
      },
      schoolZone: settings.schoolZone,
      requestWindow: {
        startLocal: settings.requestWindow.startLocal,
        endLocal: settings.requestWindow.endLocal,
        timezone: settings.timezone,
        serverNowLocal: params.window.serverNowLocal,
      },
      policies: settings.policies,
      children,
      gates,
      summary: {
        childCount: children.length,
        eligibleChildCount,
        availableGateCount: gates.length,
      },
    };
  }
}

function presentSettings(
  settings: ParentSmartPickupSettingsRecord | null,
  profile: ParentSmartPickupSchoolProfileRecord | null,
) {
  const settingsLatitude = toNumber(settings?.schoolLatitude);
  const settingsLongitude = toNumber(settings?.schoolLongitude);
  const profileLatitude = toNumber(profile?.latitude);
  const profileLongitude = toNumber(profile?.longitude);
  const hasSettingsCoordinates =
    settingsLatitude !== null && settingsLongitude !== null;
  const hasProfileCoordinates =
    profileLatitude !== null && profileLongitude !== null;
  const zoneSource: ParentSmartPickupZoneSource = hasSettingsCoordinates
    ? 'settings'
    : hasProfileCoordinates
      ? 'school_profile'
      : 'default';

  return {
    enabled: settings?.enabled ?? false,
    configured: Boolean(settings),
    timezone: settings?.timezone ?? profile?.timezone ?? DEFAULT_TIMEZONE,
    school: {
      name: profile?.schoolName ?? profile?.shortName ?? null,
    },
    schoolZone: {
      latitude: hasSettingsCoordinates
        ? settingsLatitude
        : hasProfileCoordinates
          ? profileLatitude
          : null,
      longitude: hasSettingsCoordinates
        ? settingsLongitude
        : hasProfileCoordinates
          ? profileLongitude
          : null,
      radiusMeters:
        settings?.allowedRadiusMeters ?? DEFAULT_ALLOWED_RADIUS_METERS,
      label: profile?.mapPlaceLabel ?? profile?.formattedAddress ?? null,
      source: zoneSource,
    },
    requestWindow: {
      startLocal: settings?.requestWindowStartLocal ?? null,
      endLocal: settings?.requestWindowEndLocal ?? null,
    },
    policies: {
      requirePickupCode: settings?.requirePickupCode ?? true,
      allowDelegatePickup: settings?.allowDelegatePickup ?? true,
      allowParentCancelBeforeCalled:
        settings?.allowParentCancelBeforeCalled ?? true,
    },
  };
}

function presentChildren(params: {
  guardians: ParentSmartPickupGuardianRecord[];
  links: ParentSmartPickupStudentLinkRecord[];
  enrollments: ParentSmartPickupEnrollmentRecord[];
  activeRequests: ParentSmartPickupActiveRequestRecord[];
  dismissalEnabled: boolean;
  requestWindowOpen: boolean;
  hasZone: boolean;
  pickupCodeRequired: boolean;
  parentCancelBeforeCalledAllowed: boolean;
}): ParentSmartPickupChildDto[] {
  const guardianCanPickupById = new Map(
    params.guardians.map((guardian) => [
      guardian.id,
      guardian.canPickup === true,
    ]),
  );
  const enrollmentsByStudentId = firstEnrollmentByStudentId(params.enrollments);
  const activeRequestsByStudentId = firstActiveRequestByStudentId(
    params.activeRequests,
  );
  const childrenByStudentId = new Map<string, ParentSmartPickupChildDto>();

  for (const link of params.links) {
    if (!link.student || link.student.deletedAt !== null) continue;

    const existing = childrenByStudentId.get(link.studentId);
    const linkCanPickup = guardianCanPickupById.get(link.guardianId) === true;
    if (existing) {
      existing.canPickup = existing.canPickup || linkCanPickup;
      existing.eligibilityReasons = childEligibilityReasons({
        studentStatus: link.student.status,
        hasActiveEnrollment: Boolean(enrollmentsByStudentId.get(link.studentId)),
        canPickup: existing.canPickup,
        dismissalEnabled: params.dismissalEnabled,
      });
      existing.pickupEligible = existing.eligibilityReasons.length === 0;
      existing.blockedReason = childBlockedReason({
        studentStatus: link.student.status,
        dismissalEnabled: params.dismissalEnabled,
        requestWindowOpen: params.requestWindowOpen,
        hasZone: params.hasZone,
        hasActiveEnrollment: Boolean(enrollmentsByStudentId.get(link.studentId)),
        canPickup: existing.canPickup,
        activeRequest: activeRequestsByStudentId.get(link.studentId) ?? null,
      });
      existing.canRequestPickup =
        existing.blockedReason === null && existing.activeRequest === null;
      continue;
    }

    const enrollment = enrollmentsByStudentId.get(link.studentId) ?? null;
    const activeRequest = activeRequestsByStudentId.get(link.studentId) ?? null;
    const eligibilityReasons = childEligibilityReasons({
      studentStatus: link.student.status,
      hasActiveEnrollment: Boolean(enrollment),
      canPickup: linkCanPickup,
      dismissalEnabled: params.dismissalEnabled,
    });
    const blockedReason = childBlockedReason({
      studentStatus: link.student.status,
      dismissalEnabled: params.dismissalEnabled,
      requestWindowOpen: params.requestWindowOpen,
      hasZone: params.hasZone,
      hasActiveEnrollment: Boolean(enrollment),
      canPickup: linkCanPickup,
      activeRequest,
    });

    childrenByStudentId.set(link.studentId, {
      id: link.studentId,
      displayName: studentDisplayName(link.student),
      grade: enrollment ? displayName(enrollment.classroom.section.grade) : null,
      section: enrollment ? displayName(enrollment.classroom.section) : null,
      classroom: enrollment ? displayName(enrollment.classroom) : null,
      canPickup: linkCanPickup,
      pickupEligible: eligibilityReasons.length === 0,
      eligibilityReasons,
      canRequestPickup: blockedReason === null && activeRequest === null,
      blockedReason,
      activeRequest: activeRequest
        ? presentActiveRequest({
            request: activeRequest,
            pickupCodeRequired: params.pickupCodeRequired,
            parentCancelBeforeCalledAllowed:
              params.parentCancelBeforeCalledAllowed,
          })
        : null,
    });
  }

  return [...childrenByStudentId.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

function childBlockedReason(params: {
  studentStatus: StudentStatus;
  dismissalEnabled: boolean;
  requestWindowOpen: boolean;
  hasZone: boolean;
  hasActiveEnrollment: boolean;
  canPickup: boolean;
  activeRequest: ParentSmartPickupActiveRequestRecord | null;
}): ParentSmartPickupChildDto['blockedReason'] {
  if (!params.dismissalEnabled) return 'dismissal_disabled';
  if (!params.hasZone) return 'missing_school_location';
  if (!params.requestWindowOpen) return 'outside_request_window';
  if (params.studentStatus !== StudentStatus.ACTIVE) return 'no_active_enrollment';
  if (!params.hasActiveEnrollment) return 'no_active_enrollment';
  if (!params.canPickup) return 'guardian_not_allowed';
  if (params.activeRequest) return 'active_request_exists';

  return null;
}

function childEligibilityReasons(params: {
  studentStatus: StudentStatus;
  hasActiveEnrollment: boolean;
  canPickup: boolean;
  dismissalEnabled: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!params.canPickup) reasons.push('guardian_not_allowed');
  if (params.studentStatus !== StudentStatus.ACTIVE) {
    reasons.push('student_inactive');
  }
  if (!params.hasActiveEnrollment) reasons.push('no_active_enrollment');
  if (!params.dismissalEnabled) reasons.push('dismissal_disabled');

  return reasons;
}

function readinessReasons(params: {
  enabled: boolean;
  configured: boolean;
  hasZone: boolean;
  requestWindowOpen: boolean;
  eligibleChildCount: number;
  availableGateCount: number;
}): string[] {
  const reasons: string[] = [];
  if (!params.enabled) reasons.push('dismissal_disabled');
  if (!params.configured) reasons.push('settings_not_configured');
  if (!params.hasZone) reasons.push('zone_missing');
  if (!params.requestWindowOpen) reasons.push('outside_request_window');
  if (params.eligibleChildCount === 0) reasons.push('no_eligible_child');
  if (params.availableGateCount === 0) reasons.push('no_available_gate');

  return reasons;
}

function presentGate(gate: ParentSmartPickupGateRecord): ParentSmartPickupGateDto {
  return {
    id: gate.id,
    code: gate.code,
    name: gate.name,
    campus: gate.campus,
    status: presentGateStatus(gate.status),
    isActive: gate.isActive,
    sortOrder: gate.sortOrder,
  };
}

function firstEnrollmentByStudentId(
  enrollments: ParentSmartPickupEnrollmentRecord[],
): Map<string, ParentSmartPickupEnrollmentRecord> {
  const byStudentId = new Map<string, ParentSmartPickupEnrollmentRecord>();
  for (const enrollment of enrollments) {
    if (!byStudentId.has(enrollment.studentId)) {
      byStudentId.set(enrollment.studentId, enrollment);
    }
  }

  return byStudentId;
}

function firstActiveRequestByStudentId(
  requests: ParentSmartPickupActiveRequestRecord[],
): Map<string, ParentSmartPickupActiveRequestRecord> {
  const byStudentId = new Map<string, ParentSmartPickupActiveRequestRecord>();
  for (const request of requests) {
    if (!byStudentId.has(request.studentId)) {
      byStudentId.set(request.studentId, request);
    }
  }

  return byStudentId;
}

function presentActiveRequest(params: {
  request: ParentSmartPickupActiveRequestRecord;
  pickupCodeRequired: boolean;
  parentCancelBeforeCalledAllowed: boolean;
}): ParentSmartPickupChildActiveRequestDto {
  return {
    id: params.request.id,
    status: presentRequestStatus(params.request.status),
    isActive: true,
    isTerminal: false,
    canCancel:
      params.parentCancelBeforeCalledAllowed &&
      (params.request.status === DismissalRequestStatus.REQUESTED ||
        params.request.status === DismissalRequestStatus.QUEUED),
    canTrack: true,
    requestedAt: params.request.requestedAt.toISOString(),
    gate: params.request.gate
      ? {
          id: params.request.gate.id,
          code: params.request.gate.code,
          name: params.request.gate.name,
        }
      : null,
    pickup: {
      codeRequired: params.pickupCodeRequired,
      codeIssued: Boolean(params.request.pickupCodeIssuedAt),
      codeIssuedAt: params.request.pickupCodeIssuedAt?.toISOString() ?? null,
    },
  };
}

function presentRequestStatus(status: DismissalRequestStatus) {
  return status.toLowerCase() as ParentSmartPickupChildActiveRequestDto['status'];
}

function studentDisplayName(student: {
  firstName: string;
  lastName: string;
}): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}

function toNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value ? value.toNumber() : null;
}
