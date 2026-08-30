import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  StudentCredentialAudienceMode,
  StudentStatus,
  UserType,
} from '@prisma/client';
import { isCredentialManageableStatus } from '../../../settings/users/credentials/domain/credential-user-status.policy';
import type { StudentsScope } from '../../students/domain/students-scope';
import type { StudentCredentialAudienceSelection } from '../domain/student-credential.types';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialAudienceReference,
  type StudentCredentialAudienceStudent,
} from '../infrastructure/student-credential-batch.repository';

export interface StudentCredentialEligibleTarget {
  studentId: string;
  userId: string;
  enrollmentId: string | null;
  credentialVersion: number;
  fullName: string;
  username: string | null;
  loginEmail: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
}

export interface StudentCredentialAudienceResolution {
  totalMatched: number;
  eligible: StudentCredentialEligibleTarget[];
  skipped: number;
  skippedReasons: Record<string, number>;
}

@Injectable()
export class StudentCredentialAudienceService {
  constructor(private readonly repository: StudentCredentialBatchRepository) {}

  async resolve(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<StudentCredentialAudienceResolution> {
    const result = await this.repository.resolveAudienceCandidates(
      scope,
      selection,
    );
    const eligible: StudentCredentialEligibleTarget[] = [];
    const skippedReasons: Record<string, number> = {};
    if (result.missingSelectedStudents > 0) {
      incrementReason(
        skippedReasons,
        'inaccessible_or_not_found',
        result.missingSelectedStudents,
      );
    }

    for (const student of result.students) {
      const reason = ineligibilityReason(student, selection, result.references);
      if (reason) {
        incrementReason(skippedReasons, reason);
        continue;
      }
      const user = student.user!;
      eligible.push({
        studentId: student.id,
        userId: user.id,
        enrollmentId: result.references.get(student.id)?.enrollmentId ?? null,
        credentialVersion: user.credentialVersion,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        username: user.username,
        loginEmail: user.email,
        hasPassword: user.passwordHash !== null,
        mustChangePassword: user.mustChangePassword,
      });
    }

    return {
      totalMatched: result.totalMatched,
      eligible,
      skipped: Object.values(skippedReasons).reduce(
        (total, count) => total + count,
        0,
      ),
      skippedReasons,
    };
  }
}

function ineligibilityReason(
  student: StudentCredentialAudienceStudent,
  selection: StudentCredentialAudienceSelection,
  references: ReadonlyMap<string, StudentCredentialAudienceReference>,
): string | null {
  if (student.status !== StudentStatus.ACTIVE || student.deletedAt !== null) {
    return 'student_inactive';
  }
  if (!student.userId || !student.user) return 'student_account_missing';
  const expectedUserId = references.get(student.id)?.expectedUserId;
  if (expectedUserId && expectedUserId !== student.user.id) {
    return 'student_account_changed';
  }
  if (
    student.user.userType !== UserType.STUDENT ||
    student.user.deletedAt !== null ||
    !isCredentialManageableStatus(student.user.status)
  ) {
    return 'student_account_ineligible';
  }
  const membership = student.user.memberships.find(
    (candidate) =>
      candidate.schoolId === student.schoolId &&
      candidate.organizationId === student.organizationId &&
      candidate.userType === UserType.STUDENT &&
      candidate.status === MembershipStatus.ACTIVE &&
      candidate.deletedAt === null,
  );
  if (!membership) return 'student_membership_ineligible';
  if (
    selection.audienceMode === StudentCredentialAudienceMode.MISSING_PASSWORD &&
    student.user.passwordHash !== null
  ) {
    return 'password_already_present';
  }
  return null;
}

function incrementReason(
  reasons: Record<string, number>,
  reason: string,
  increment = 1,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + increment;
}
