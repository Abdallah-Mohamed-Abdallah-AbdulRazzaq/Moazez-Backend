export class ParentHomeParentDto {
  userId!: string;
  displayName!: string;
  email!: string;
  phone!: string | null;
}

export class ParentHomeSchoolDto {
  name!: string | null;
  logoUrl!: null;
}

export class ParentHomeHierarchyNodeDto {
  id!: string;
  name!: string;
}

export class ParentHomeChildSummariesDto {
  attendanceToday!: string | null;
  gradesAverage!: number | null;
  behaviorPoints!: number | null;
  pendingTasksCount!: number;
  unreadMessagesCount!: number | null;
}

export class ParentHomeChildDto {
  studentId!: string;
  displayName!: string;
  avatarUrl!: null;
  enrollmentId!: string;
  classroom!: ParentHomeHierarchyNodeDto;
  stage!: ParentHomeHierarchyNodeDto;
  grade!: ParentHomeHierarchyNodeDto;
  section!: ParentHomeHierarchyNodeDto;
  summaries!: ParentHomeChildSummariesDto;
}

export class ParentHomeSummariesDto {
  childrenCount!: number;
  pendingTasksCount!: number;
  unreadMessagesCount!: number | null;
  announcementsCount!: number | null;
}

export class ParentHomeScheduleDto {
  available!: false;
  reason!: 'timetable_not_available';
}

export class ParentHomeResponseDto {
  parent!: ParentHomeParentDto;
  school!: ParentHomeSchoolDto;
  children!: ParentHomeChildDto[];
  summaries!: ParentHomeSummariesDto;
  schedule!: ParentHomeScheduleDto;
}
