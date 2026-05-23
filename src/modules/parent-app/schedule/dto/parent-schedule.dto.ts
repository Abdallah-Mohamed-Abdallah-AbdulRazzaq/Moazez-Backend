export class ParentScheduleChildDto {
  id!: string;
  displayName!: string;
}

export class ParentSchedulePeriodDto {
  id!: string;
  index!: number;
  label!: string;
  startTime!: string;
  endTime!: string;
}

export class ParentScheduleSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
}

export class ParentScheduleTeacherDto {
  id!: string;
  fullName!: string;
}

export class ParentScheduleClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class ParentScheduleRoomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class ParentScheduleItemDto {
  scheduleId!: string;
  timetableEntryId!: string;
  period!: ParentSchedulePeriodDto;
  subject!: ParentScheduleSubjectDto;
  teacher!: ParentScheduleTeacherDto;
  classroom!: ParentScheduleClassroomDto;
  room!: ParentScheduleRoomDto | null;
  notes!: string | null;
  status!: 'scheduled' | 'upcoming' | 'current' | 'completed';
  needsAttendance!: boolean;
  hasHomework!: boolean | null;
  isExam!: boolean | null;
  isBreak!: boolean;
}

export class ParentChildTodayScheduleResponseDto {
  date!: string;
  dayOfWeek!: number;
  child!: ParentScheduleChildDto;
  items!: ParentScheduleItemDto[];
}

export class ParentWeeklyScheduleDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: ParentScheduleItemDto[];
}

export class ParentChildWeeklyScheduleResponseDto {
  weekStartDate!: string;
  weekEndDate!: string;
  child!: ParentScheduleChildDto;
  days!: ParentWeeklyScheduleDayDto[];
}
