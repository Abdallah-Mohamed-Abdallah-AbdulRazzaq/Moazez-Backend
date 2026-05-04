import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import type { TeacherClassroomRosterStudentRecord } from '../infrastructure/teacher-classroom-read.adapter';
import {
  TeacherClassroomDetailResponseDto,
  TeacherClassroomRosterResponseDto,
} from '../dto/teacher-classroom.dto';

export interface TeacherClassroomDetailPresenterInput {
  allocation: TeacherAppAllocationRecord;
  studentsCount: number;
}

export interface TeacherClassroomRosterPresenterInput {
  classId: string;
  students: TeacherClassroomRosterStudentRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export class TeacherClassroomPresenter {
  static presentDetail(
    input: TeacherClassroomDetailPresenterInput,
  ): TeacherClassroomDetailResponseDto {
    const classroom = input.allocation.classroom;
    const section = classroom?.section;
    const grade = section?.grade;
    const stage = grade?.stage;

    return {
      classId: input.allocation.id,
      classroom: {
        id: input.allocation.classroomId,
        name: localizedName(classroom),
        code: null,
      },
      subject: {
        id: input.allocation.subjectId,
        name: localizedName(input.allocation.subject),
      },
      term: {
        id: input.allocation.termId,
        name: localizedName(input.allocation.term),
      },
      academicHierarchy: {
        stageName: localizedName(stage),
        gradeName: localizedName(grade),
        sectionName: localizedName(section),
      },
      summary: {
        studentsCount: input.studentsCount,
        presentTodayCount: null,
        absentTodayCount: null,
        pendingAssignmentsCount: null,
        averageGrade: null,
        behaviorAlertsCount: null,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
      },
    };
  }

  static presentRoster(
    input: TeacherClassroomRosterPresenterInput,
  ): TeacherClassroomRosterResponseDto {
    return {
      classId: input.classId,
      students: input.students.map((student) => ({
        id: student.id,
        displayName: fullName(student),
        studentNumber: null,
        avatarUrl: null,
        status: 'active',
        attendanceToday: null,
        latestGrade: null,
        behaviorSummary: null,
      })),
      pagination: input.pagination,
    };
  }
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string {
  return value?.nameEn ?? value?.nameAr ?? '';
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}
