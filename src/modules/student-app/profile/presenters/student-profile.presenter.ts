import {
  StudentProfileEnrollmentDto,
  StudentProfileResponseDto,
} from '../dto/student-profile.dto';
import type {
  StudentProfileEnrollmentRecord,
  StudentProfileIdentityRecord,
  StudentProfileSchoolDisplayRecord,
} from '../infrastructure/student-profile-read.adapter';

export interface StudentProfilePresenterInput {
  student: StudentProfileIdentityRecord;
  school: StudentProfileSchoolDisplayRecord;
  enrollment: StudentProfileEnrollmentRecord;
  totalXp: number;
}

export class StudentProfilePresenter {
  static present(input: StudentProfilePresenterInput): StudentProfileResponseDto {
    const displayName = fullName(input.student);
    const enrollment = presentEnrollment(input.enrollment);

    return {
      student: {
        studentId: input.student.id,
        userId: input.student.userId ?? '',
        displayName,
        firstName: input.student.firstName,
        lastName: input.student.lastName,
        email: input.student.user?.email ?? '',
        phone: input.student.user?.phone ?? null,
        avatarUrl: null,
        studentNumber: null,
        status: 'active',
      },
      school: input.school,
      enrollment,
      unsupported: {
        avatarUpload: true,
        preferences: true,
        seatNumber: true,
      },
      student_profile: {
        name: displayName,
        grade: enrollment.grade.name,
        school_name: input.school.name,
        student_code: null,
        level: 0,
        current_xp: input.totalXp,
        total_xp: input.totalXp,
        next_level_xp: 0,
        rank_title: null,
        rank_image_url: null,
      },
      recent_badges: [],
      top_students: [],
      leaderboard: [],
    };
  }
}

function presentEnrollment(
  enrollment: StudentProfileEnrollmentRecord,
): StudentProfileEnrollmentDto {
  const classroom = enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    enrollmentId: enrollment.id,
    academicYearId: enrollment.academicYearId,
    termId: enrollment.termId,
    classroom: {
      id: classroom.id,
      name: displayName(classroom),
    },
    stage: {
      id: stage.id,
      name: displayName(stage),
    },
    grade: {
      id: grade.id,
      name: displayName(grade),
    },
    section: {
      id: section.id,
      name: displayName(section),
    },
  };
}

function fullName(
  student: Pick<StudentProfileIdentityRecord, 'firstName' | 'lastName'>,
): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
