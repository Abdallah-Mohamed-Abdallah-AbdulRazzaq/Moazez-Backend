export class StudentHomeStudentDto {
  studentId!: string;
  displayName!: string;
  avatarUrl!: null;
}

export class StudentHomeSchoolDto {
  name!: string | null;
  logoUrl!: null;
}

export class StudentHomeHierarchyNodeDto {
  id!: string;
  name!: string;
}

export class StudentHomeEnrollmentDto {
  enrollmentId!: string;
  academicYearId!: string;
  termId!: string | null;
  classroom!: StudentHomeHierarchyNodeDto;
  stage!: StudentHomeHierarchyNodeDto;
  grade!: StudentHomeHierarchyNodeDto;
  section!: StudentHomeHierarchyNodeDto;
}

export class StudentHomeScheduleDto {
  available!: false;
  reason!: 'timetable_not_available';
}

export class StudentHomeTodayDto {
  attendanceStatus!: string | null;
  schedule!: StudentHomeScheduleDto;
}

export class StudentHomeSummariesDto {
  subjectsCount!: number;
  pendingTasksCount!: number;
  unreadMessagesCount!: number | null;
  announcementsCount!: number | null;
  totalXp!: number;
  behaviorPoints!: number | null;
}

export class StudentHomeStudentSummaryDto {
  name!: string;
  avatar_url!: string | null;
  level!: number;
  current_xp!: number;
  next_level_xp!: number;
  notifications_count!: number;
}

export class StudentHomeHeroJourneyPreviewDto {
  title!: string | null;
  image_url!: string | null;
}

export class StudentHomeRequiredTodayItemDto {
  id!: string;
  type!: 'homework' | 'lesson' | 'meeting';
  title!: string;
  subtitle!: string;
  time_label!: string;
  xp!: number;
}

export class StudentHomeResponseDto {
  student!: StudentHomeStudentDto;
  school!: StudentHomeSchoolDto;
  enrollment!: StudentHomeEnrollmentDto;
  today!: StudentHomeTodayDto;
  summaries!: StudentHomeSummariesDto;
  student_summary!: StudentHomeStudentSummaryDto;
  hero_journey_preview!: StudentHomeHeroJourneyPreviewDto;
  required_today!: StudentHomeRequiredTodayItemDto[];
  today_tasks!: [];
}
