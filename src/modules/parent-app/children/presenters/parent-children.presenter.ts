import {
  ParentChildCardDto,
  ParentChildDetailEnrollmentDto,
  ParentChildDetailResponseDto,
  ParentChildrenListResponseDto,
} from '../dto/parent-children.dto';
import type { ParentChildEnrollmentRecord } from '../infrastructure/parent-children-read.adapter';

export class ParentChildrenPresenter {
  static presentList(
    children: ParentChildEnrollmentRecord[],
  ): ParentChildrenListResponseDto {
    return children.map((child) => presentChildCard(child));
  }

  static presentDetail(
    child: ParentChildEnrollmentRecord,
  ): ParentChildDetailResponseDto {
    return {
      student: {
        studentId: child.studentId,
        displayName: studentDisplayName(child.student),
        avatarUrl: null,
        status: 'active',
      },
      enrollment: presentEnrollment(child),
      summaries: {
        attendance: {
          available: false,
          reason: 'detailed_attendance_not_in_this_slice',
        },
        grades: {
          available: false,
          reason: 'grades_slice_not_loaded',
        },
        behavior: {
          available: false,
          reason: 'behavior_slice_not_loaded',
        },
        progress: {
          available: false,
          reason: 'progress_slice_not_loaded',
        },
      },
      unsupported: {
        schedule: true,
        homeworks: true,
        pickup: true,
      },
    };
  }
}

function presentChildCard(
  enrollment: ParentChildEnrollmentRecord,
): ParentChildCardDto {
  const hierarchy = presentEnrollment(enrollment);

  return {
    studentId: enrollment.studentId,
    displayName: studentDisplayName(enrollment.student),
    avatarUrl: null,
    status: 'active',
    enrollmentId: enrollment.id,
    classroom: hierarchy.classroom,
    stage: hierarchy.stage,
    grade: hierarchy.grade,
    section: hierarchy.section,
  };
}

function presentEnrollment(
  enrollment: ParentChildEnrollmentRecord,
): ParentChildDetailEnrollmentDto {
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

function studentDisplayName(
  student: Pick<
    ParentChildEnrollmentRecord['student'],
    'firstName' | 'lastName'
  >,
): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
