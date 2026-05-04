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
  unreadMessagesCount!: number | null;
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

export class TeacherHomeResponseDto {
  teacher!: TeacherHomeTeacherDto;
  school!: TeacherHomeSchoolDto;
  summary!: TeacherHomeSummaryDto;
  schedule!: TeacherHomeScheduleDto;
  userInfo!: TeacherHomeUserInfoDto;
  stats!: TeacherHomeStatDto[];
  weeklySchedule!: TeacherHomeWeeklyScheduleDayDto[];
  actionSummaries!: TeacherHomeActionSummaryDto[];
}
