import type {
  TeacherProfileIdentityRecord,
  TeacherProfileRoleRecord,
  TeacherProfileSchoolDisplayRecord,
} from '../infrastructure/teacher-profile-read.adapter';
import {
  TeacherEmploymentProfileResponseDto,
  TeacherProfileResponseDto,
} from '../dto/teacher-profile.dto';

export interface TeacherProfilePresenterInput {
  teacher: TeacherProfileIdentityRecord;
  school: TeacherProfileSchoolDisplayRecord;
  role: TeacherProfileRoleRecord | null;
  fallbackRoleId: string;
  classesSummary: {
    classesCount: number;
    subjectsCount: number;
    studentsCount: number;
  };
  permissions: string[];
}

export class TeacherProfilePresenter {
  static presentProfile(
    input: TeacherProfilePresenterInput,
  ): TeacherProfileResponseDto {
    return {
      teacher: {
        userId: input.teacher.id,
        displayName: displayName(input.teacher),
        email: input.teacher.email,
        phone: input.teacher.phone ?? null,
        avatarUrl: null,
        userType: 'teacher',
      },
      school: input.school,
      role: {
        roleId: input.role?.roleId ?? input.fallbackRoleId,
        name: input.role?.role.name ?? null,
      },
      classesSummary: input.classesSummary,
      permissions: [...input.permissions],
    };
  }

  static presentEmploymentUnsupported(): TeacherEmploymentProfileResponseDto {
    return {
      employment: {
        employeeId: null,
        department: null,
        specialization: null,
        employmentType: null,
        joiningDate: null,
        officeHours: null,
        manager: null,
        status: 'unsupported',
      },
      reason: 'teacher_employment_profile_not_available',
    };
  }
}

function displayName(
  teacher: Pick<
    TeacherProfileIdentityRecord,
    'firstName' | 'lastName' | 'email'
  >,
): string {
  return `${teacher.firstName} ${teacher.lastName}`.trim() || teacher.email;
}
