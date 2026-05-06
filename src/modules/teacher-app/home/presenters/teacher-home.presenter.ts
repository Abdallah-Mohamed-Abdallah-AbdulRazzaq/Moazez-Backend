import type {
  TeacherAppSchoolSummaryRecord,
  TeacherAppTeacherIdentityRecord,
} from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import {
  TeacherHomeResponseDto,
  TeacherHomeStatDto,
  TeacherHomeTasksDto,
  TeacherHomeXpDto,
} from '../dto/teacher-home.dto';

export interface TeacherHomePresenterInput {
  teacher: TeacherAppTeacherIdentityRecord;
  school: TeacherAppSchoolSummaryRecord;
  classesCount: number;
  studentsCount: number;
  pendingTasksCount: number;
  tasks: TeacherHomeTasksDto;
  xp: TeacherHomeXpDto;
  messages: TeacherHomeResponseDto['messages'];
  now: Date;
}

export class TeacherHomePresenter {
  static present(input: TeacherHomePresenterInput): TeacherHomeResponseDto {
    const teacherName = fullName(input.teacher);
    const dateLabel = formatDateLabel(input.now);
    const stats = buildStats(input);

    return {
      teacher: {
        id: input.teacher.id,
        name: teacherName,
        email: input.teacher.email,
        userType: 'teacher',
      },
      school: input.school,
      summary: {
        classesCount: input.classesCount,
        studentsCount: input.studentsCount,
        pendingTasksCount: input.pendingTasksCount,
        unreadMessagesCount: input.messages.unreadMessagesCount,
        unreadNotificationsCount: null,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
        items: [],
      },
      userInfo: {
        id: input.teacher.id,
        name: teacherName,
        email: input.teacher.email,
        userType: 'teacher',
        dateLabel,
        points: 0,
        avatarUrl: null,
      },
      stats,
      weeklySchedule: [],
      actionSummaries: [
        {
          title: 'Pending tasks',
          subTitle: 'Teacher-assigned reinforcement follow-up',
          count: input.tasks.activeTasksCount,
          tag: null,
          progress: null,
        },
        {
          title: 'Pending reviews',
          subTitle: 'Student submissions awaiting review',
          count: input.tasks.pendingReviewCount,
          tag: null,
          progress: null,
        },
        {
          title: 'Unread messages',
          subTitle: 'Existing participant conversations',
          count: input.messages.unreadMessagesCount,
          tag:
            input.messages.unreadConversationsCount > 0
              ? 'unread_conversations'
              : null,
          progress: null,
        },
        {
          title: 'Schedule',
          subTitle: 'Timetable is not available yet',
          count: 0,
          tag: 'timetable_not_available',
          progress: null,
        },
      ],
      tasks: input.tasks,
      xp: input.xp,
      messages: input.messages,
    };
  }
}

function buildStats(input: TeacherHomePresenterInput): TeacherHomeStatDto[] {
  return [
    {
      title: 'Teacher points',
      value: '0',
      subValue: 'Not available in V1 core data',
      type: 'points',
    },
    {
      title: 'Assigned classes',
      value: String(input.classesCount),
      subValue: null,
      type: 'remainingClasses',
    },
    {
      title: 'Students',
      value: String(input.studentsCount),
      subValue: null,
      type: 'currentClass',
    },
  ];
}

function fullName(
  teacher: Pick<TeacherAppTeacherIdentityRecord, 'firstName' | 'lastName'>,
): string {
  return `${teacher.firstName} ${teacher.lastName}`.trim();
}

function formatDateLabel(now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);
}
