import {
  ParentHomeChildDto,
  ParentHomeResponseDto,
} from '../dto/parent-home.dto';
import type {
  ParentHomeChildRecord,
  ParentHomeIdentityRecord,
  ParentHomePendingTaskCountRecord,
  ParentHomeSchoolDisplayRecord,
} from '../infrastructure/parent-home-read.adapter';

export interface ParentHomePresenterInput {
  parent: ParentHomeIdentityRecord;
  school: ParentHomeSchoolDisplayRecord;
  children: ParentHomeChildRecord[];
  pendingTaskCounts: ParentHomePendingTaskCountRecord[];
}

export class ParentHomePresenter {
  static present(input: ParentHomePresenterInput): ParentHomeResponseDto {
    const pendingCounts = new Map(
      input.pendingTaskCounts.map((item) => [item.studentId, item.count]),
    );
    const children = input.children.map((child) =>
      presentChild(child, pendingCounts.get(child.studentId) ?? 0),
    );
    const pendingTasksCount = children.reduce(
      (total, child) => total + child.summaries.pendingTasksCount,
      0,
    );

    return {
      parent: {
        userId: input.parent.id,
        displayName: fullName(input.parent),
        email: input.parent.email,
        phone: input.parent.phone ?? null,
      },
      school: input.school,
      children,
      summaries: {
        childrenCount: children.length,
        pendingTasksCount,
        unreadMessagesCount: null,
        announcementsCount: null,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
      },
    };
  }
}

function presentChild(
  enrollment: ParentHomeChildRecord,
  pendingTasksCount: number,
): ParentHomeChildDto {
  const classroom = enrollment.classroom;
  const section = classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    studentId: enrollment.studentId,
    displayName: fullName(enrollment.student),
    avatarUrl: null,
    enrollmentId: enrollment.id,
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
    summaries: {
      attendanceToday: null,
      gradesAverage: null,
      behaviorPoints: null,
      pendingTasksCount,
      unreadMessagesCount: null,
    },
  };
}

function fullName(
  person: Pick<ParentHomeIdentityRecord, 'firstName' | 'lastName' | 'email'>,
): string;
function fullName(
  person: Pick<ParentHomeChildRecord['student'], 'firstName' | 'lastName'>,
): string;
function fullName(person: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): string {
  return (
    `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() ||
    person.email ||
    ''
  );
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
