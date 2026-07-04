import { UserStatus } from '@prisma/client';
import { presentGateStatus } from '../../shared/dismissal.types';
import { DismissalStaffAssignmentRecord } from '../../staff-assignments/infrastructure/dismissal-staff-assignments.repository';
import {
  presentDismissalAssignmentAcademicScope,
  presentStaffDisplayName,
} from '../../staff-assignments/presenter/dismissal-staff-assignment.presenter';
import { DismissalProfileResponseDto } from '../dto/dismissal-profile.dto';
import {
  DismissalProfileSchoolRecord,
  DismissalProfileUserRecord,
} from '../../staff-assignments/infrastructure/dismissal-staff-assignments.repository';

const DEFAULT_TIMEZONE = 'Africa/Cairo';

export function presentDismissalProfile(params: {
  user: DismissalProfileUserRecord;
  school: DismissalProfileSchoolRecord | null;
  assignments: DismissalStaffAssignmentRecord[];
  permissions: string[];
}): DismissalProfileResponseDto {
  const gateById = new Map<string, DismissalProfileResponseDto['assignments']['gates'][number]>();
  const academicScopes: DismissalProfileResponseDto['assignments']['academicScopes'] =
    [];

  for (const assignment of params.assignments) {
    if (assignment.gate && !assignment.gate.deletedAt) {
      gateById.set(assignment.gate.id, {
        id: assignment.gate.id,
        code: assignment.gate.code,
        name: assignment.gate.name,
        status: presentGateStatus(assignment.gate.status),
      });
    }

    const academicScope = presentDismissalAssignmentAcademicScope(assignment);
    if (
      academicScope.stage ||
      academicScope.grade ||
      academicScope.section ||
      academicScope.classroom
    ) {
      academicScopes.push({
        ...academicScope,
        isLead: assignment.isLead,
        startsAt: assignment.startsAt?.toISOString() ?? null,
        endsAt: assignment.endsAt?.toISOString() ?? null,
      });
    }
  }

  const leadCount = params.assignments.filter((item) => item.isLead).length;

  return {
    profile: {
      displayName: presentStaffDisplayName(params.user),
      userType: 'dismissal_staff',
      status: statusForProfile(params.user.status),
    },
    school: {
      name: params.school?.name ?? null,
      timezone:
        params.school?.dismissalSettings?.timezone ??
        params.school?.schoolProfile?.timezone ??
        DEFAULT_TIMEZONE,
    },
    assignments: {
      totalCount: params.assignments.length,
      leadCount,
      activeCount: params.assignments.length,
      gates: [...gateById.values()],
      academicScopes,
    },
    readiness: {
      hasAssignments: params.assignments.length > 0,
      canViewGates: params.permissions.includes('dismissal.gates.view'),
      canManageRequests: params.permissions.includes('dismissal.requests.manage'),
      canDeliver: params.permissions.includes('dismissal.requests.deliver'),
      canEscalate: params.permissions.includes('dismissal.requests.escalate'),
    },
  };
}

function statusForProfile(status: UserStatus): 'active' {
  if (status !== UserStatus.ACTIVE) {
    return 'active';
  }

  return 'active';
}
