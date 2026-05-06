import {
  StudentHomeEnrollmentDto,
  StudentHomeResponseDto,
} from '../dto/student-home.dto';
import type {
  StudentHomeEnrollmentRecord,
  StudentHomeIdentityRecord,
  StudentHomeSchoolDisplayRecord,
} from '../infrastructure/student-home-read.adapter';

export interface StudentHomePresenterInput {
  student: StudentHomeIdentityRecord;
  school: StudentHomeSchoolDisplayRecord;
  enrollment: StudentHomeEnrollmentRecord;
  subjectsCount: number;
  pendingTasksCount: number;
  totalXp: number;
}

export class StudentHomePresenter {
  static present(input: StudentHomePresenterInput): StudentHomeResponseDto {
    const displayName = fullName(input.student);
    const enrollment = presentEnrollment(input.enrollment);

    return {
      student: {
        studentId: input.student.id,
        displayName,
        avatarUrl: null,
      },
      school: input.school,
      enrollment,
      today: {
        attendanceStatus: null,
        schedule: {
          available: false,
          reason: 'timetable_not_available',
        },
      },
      summaries: {
        subjectsCount: input.subjectsCount,
        pendingTasksCount: input.pendingTasksCount,
        unreadMessagesCount: null,
        announcementsCount: null,
        totalXp: input.totalXp,
        behaviorPoints: null,
      },
      student_summary: {
        name: displayName,
        avatar_url: null,
        level: 0,
        current_xp: input.totalXp,
        next_level_xp: 0,
        notifications_count: 0,
      },
      hero_journey_preview: {
        title: null,
        image_url: null,
      },
      required_today: [],
      today_tasks: [],
    };
  }
}

function presentEnrollment(
  enrollment: StudentHomeEnrollmentRecord,
): StudentHomeEnrollmentDto {
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

function fullName(student: Pick<StudentHomeIdentityRecord, 'firstName' | 'lastName'>): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
