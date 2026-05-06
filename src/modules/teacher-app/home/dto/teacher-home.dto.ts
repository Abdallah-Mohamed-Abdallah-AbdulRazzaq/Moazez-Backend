export class TeacherHomeTeacherDto {
  id!: string;
  name!: string;
  email!: string;
  userType!: 'teacher';
}

export class TeacherHomeSchoolDto {
  name!: string | null;
  logoUrl!: string | null;
}

export class TeacherHomeSummaryDto {
  classesCount!: number;
  studentsCount!: number;
  pendingTasksCount!: number;
  unreadMessagesCount!: number;
  unreadNotificationsCount!: number | null;
}

export class TeacherHomeScheduleDto {
  available!: false;
  reason!: 'timetable_not_available';
  items!: [];
}

export class TeacherHomeUserInfoDto {
  id!: string;
  name!: string;
  email!: string;
  userType!: 'teacher';
  dateLabel!: string;
  points!: number;
  avatarUrl!: string | null;
}

export class TeacherHomeStatDto {
  title!: string;
  value!: string;
  subValue!: string | null;
  type!: 'points' | 'remainingClasses' | 'currentClass';
}

export class TeacherHomeWeeklyScheduleDayDto {
  dayName!: string;
  items!: [];
}

export class TeacherHomeActionSummaryDto {
  title!: string;
  subTitle!: string;
  count!: number;
  tag!: string | null;
  progress!: number | null;
}

export class TeacherHomeTaskSummaryItemDto {
  taskId!: string;
  title!: string;
  status!: string;
  dueAt!: string | null;
}

export class TeacherHomeTasksDto {
  activeTasksCount!: number;
  pendingReviewCount!: number;
  recentTasks!: TeacherHomeTaskSummaryItemDto[];
}

export class TeacherHomeTopStudentDto {
  studentId!: string;
  displayName!: string;
  totalXp!: number;
}

export class TeacherHomeXpDto {
  studentsCount!: number;
  totalXp!: number;
  averageXp!: number;
  topStudent!: TeacherHomeTopStudentDto | null;
}

export class TeacherHomeMessageConversationDto {
  conversationId!: string;
  type!: string;
  title!: string | null;
  displayName!: string;
  status!: string;
  unreadCount!: number;
  participantsCount!: number;
  lastActivityAt!: string | null;
  updatedAt!: string;
}

export class TeacherHomeMessagesDto {
  unreadConversationsCount!: number;
  unreadMessagesCount!: number;
  recentConversations!: TeacherHomeMessageConversationDto[];
}

export class TeacherHomeResponseDto {
  teacher!: TeacherHomeTeacherDto;
  school!: TeacherHomeSchoolDto;
  summary!: TeacherHomeSummaryDto;
  schedule!: TeacherHomeScheduleDto;
  userInfo!: TeacherHomeUserInfoDto;
  stats!: TeacherHomeStatDto[];
  weeklySchedule!: TeacherHomeWeeklyScheduleDayDto[];
  actionSummaries!: TeacherHomeActionSummaryDto[];
  tasks!: TeacherHomeTasksDto;
  xp!: TeacherHomeXpDto;
  messages!: TeacherHomeMessagesDto;
}
