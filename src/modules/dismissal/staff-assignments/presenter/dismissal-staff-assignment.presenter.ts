import { UserStatus } from '@prisma/client';
import { presentGateStatus } from '../../shared/dismissal.types';
import {
  DismissalAcademicNodeDto,
  DismissalAcademicScopeDto,
  DismissalStaffAssignmentResponseDto,
  DismissalStaffSummaryDto,
} from '../dto/dismissal-staff-assignment.dto';
import { DismissalStaffAssignmentRecord } from '../infrastructure/dismissal-staff-assignments.repository';

type AcademicNode = {
  id: string;
  nameAr: string;
  nameEn: string;
};

function deriveName(node: AcademicNode): string {
  return node.nameEn.trim().length > 0 ? node.nameEn : node.nameAr;
}

function presentAcademicNode(
  node: AcademicNode | null | undefined,
): DismissalAcademicNodeDto | null {
  return node ? { id: node.id, name: deriveName(node) } : null;
}

export function presentDismissalStaffStatus(
  status: UserStatus,
): 'active' | 'inactive' | 'suspended' {
  if (status === UserStatus.ACTIVE) return 'active';
  if (status === UserStatus.SUSPENDED) return 'suspended';
  return 'inactive';
}

export function presentStaffDisplayName(user: {
  firstName: string;
  lastName: string;
}): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function presentDismissalStaffSummary(user: {
  email: string | null;
  firstName: string;
  lastName: string;
  status: UserStatus;
}): DismissalStaffSummaryDto {
  return {
    displayName: presentStaffDisplayName(user),
    email: user.email ?? null,
    userType: 'dismissal_staff',
    status: presentDismissalStaffStatus(user.status),
  };
}

export function presentDismissalAssignmentAcademicScope(
  assignment: DismissalStaffAssignmentRecord,
): DismissalAcademicScopeDto {
  const classroom = assignment.classroom;
  const section = assignment.section ?? classroom?.section ?? null;
  const grade = assignment.grade ?? section?.grade ?? null;
  const stage = assignment.stage ?? grade?.stage ?? null;

  return {
    stage: presentAcademicNode(stage),
    grade: presentAcademicNode(grade),
    section: presentAcademicNode(section),
    classroom: presentAcademicNode(classroom),
  };
}

export function presentDismissalStaffAssignment(
  assignment: DismissalStaffAssignmentRecord,
): DismissalStaffAssignmentResponseDto {
  return {
    id: assignment.id,
    staff: presentDismissalStaffSummary(assignment.staffUser),
    gate:
      assignment.gate && !assignment.gate.deletedAt
        ? {
            id: assignment.gate.id,
            code: assignment.gate.code,
            name: assignment.gate.name,
            status: presentGateStatus(assignment.gate.status),
          }
        : null,
    academicScope: presentDismissalAssignmentAcademicScope(assignment),
    isLead: assignment.isLead,
    isActive: assignment.isActive,
    startsAt: assignment.startsAt?.toISOString() ?? null,
    endsAt: assignment.endsAt?.toISOString() ?? null,
    notes: assignment.notes ?? null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
