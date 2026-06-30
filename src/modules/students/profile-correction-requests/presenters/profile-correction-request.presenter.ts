import type { Prisma } from '@prisma/client';
import {
  StaffProfileCorrectionRequestResponseDto,
  StudentProfileCorrectionRequestResponseDto,
} from '../dto/profile-correction-request.dto';
import type { ProfileCorrectionRequestRecord } from '../infrastructure/profile-correction-requests.repository';

export function presentStudentProfileCorrectionRequest(
  request: ProfileCorrectionRequestRecord,
): StudentProfileCorrectionRequestResponseDto {
  return {
    id: request.id,
    status: request.status,
    requestedChanges: safeJsonObject(request.requestedChanges),
    reason: request.reason,
    reviewerNote: request.reviewerNote,
    submittedAt: request.createdAt.toISOString(),
    resolvedAt: resolvedAt(request),
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
  };
}

export function presentStudentProfileCorrectionRequests(
  requests: ProfileCorrectionRequestRecord[],
): StudentProfileCorrectionRequestResponseDto[] {
  return requests.map(presentStudentProfileCorrectionRequest);
}

export function presentStaffProfileCorrectionRequest(
  request: ProfileCorrectionRequestRecord,
): StaffProfileCorrectionRequestResponseDto {
  const displayName = `${request.student.firstName} ${request.student.lastName}`.trim();

  return {
    ...presentStudentProfileCorrectionRequest(request),
    student: {
      studentId: request.student.id,
      displayName,
      studentNumber: null,
      firstName: request.student.firstName,
      lastName: request.student.lastName,
      status: request.student.status.toLowerCase(),
    },
    currentSnapshot: request.currentSnapshot
      ? safeJsonObject(request.currentSnapshot)
      : null,
  };
}

export function presentStaffProfileCorrectionRequests(
  requests: ProfileCorrectionRequestRecord[],
): StaffProfileCorrectionRequestResponseDto[] {
  return requests.map(presentStaffProfileCorrectionRequest);
}

function resolvedAt(request: ProfileCorrectionRequestRecord): string | null {
  return (
    request.approvedAt?.toISOString() ??
    request.rejectedAt?.toISOString() ??
    null
  );
}

function safeJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
