import { ParentProfileResponseDto } from '../dto/parent-profile.dto';
import type {
  ParentProfileChildRecord,
  ParentProfileGuardianRecord,
  ParentProfileIdentityRecord,
  ParentProfileSchoolDisplayRecord,
} from '../infrastructure/parent-profile-read.adapter';

export interface ParentProfilePresenterInput {
  parent: ParentProfileIdentityRecord;
  guardians: ParentProfileGuardianRecord[];
  children: ParentProfileChildRecord[];
  school: ParentProfileSchoolDisplayRecord;
}

export class ParentProfilePresenter {
  static present(input: ParentProfilePresenterInput): ParentProfileResponseDto {
    return {
      parent: {
        userId: input.parent.id,
        displayName: parentDisplayName(input.parent),
        firstName: input.parent.firstName,
        lastName: input.parent.lastName,
        email: input.parent.email,
        phone: input.parent.phone ?? null,
        avatarUrl: null,
      },
      guardians: input.guardians.map((guardian) => ({
        guardianId: guardian.id,
        relationship: guardian.relation,
        isPrimary: guardian.isPrimary,
      })),
      children: input.children.map((child) => ({
        studentId: child.studentId,
        displayName: studentDisplayName(child.student),
        enrollmentId: child.id,
      })),
      school: input.school,
      unsupported: {
        avatarUpload: true,
        preferences: true,
        supportTickets: true,
        addChild: true,
      },
    };
  }
}

function parentDisplayName(
  parent: Pick<ParentProfileIdentityRecord, 'firstName' | 'lastName' | 'email'>,
): string {
  return `${parent.firstName} ${parent.lastName}`.trim() || parent.email;
}

function studentDisplayName(
  student: Pick<ParentProfileChildRecord['student'], 'firstName' | 'lastName'>,
): string {
  return `${student.firstName} ${student.lastName}`.trim();
}
