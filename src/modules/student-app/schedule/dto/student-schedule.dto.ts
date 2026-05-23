import { IsString, Matches } from 'class-validator';

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class StudentScheduleDateQueryDto {
  @IsString()
  @Matches(YYYY_MM_DD_PATTERN)
  date!: string;
}

export class StudentSchedulePeriodDto {
  id!: string;
  index!: number;
  label!: string;
  startTime!: string;
  endTime!: string;
}

export class StudentScheduleSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
}

export class StudentScheduleTeacherDto {
  id!: string;
  fullName!: string;
}

export class StudentScheduleClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class StudentScheduleRoomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class StudentScheduleItemDto {
  scheduleId!: string;
  timetableEntryId!: string;
  period!: StudentSchedulePeriodDto;
  subject!: StudentScheduleSubjectDto;
  teacher!: StudentScheduleTeacherDto;
  classroom!: StudentScheduleClassroomDto;
  room!: StudentScheduleRoomDto | null;
  notes!: string | null;
  status!: 'scheduled' | 'upcoming' | 'current' | 'completed';
  needsAttendance!: boolean;
  hasHomework!: boolean | null;
  isExam!: boolean | null;
  isBreak!: boolean;
}

export class StudentDailyScheduleResponseDto {
  date!: string;
  dayOfWeek!: number;
  items!: StudentScheduleItemDto[];
}

export class StudentWeeklyScheduleDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: StudentScheduleItemDto[];
}

export class StudentWeeklyScheduleResponseDto {
  weekStartDate!: string;
  weekEndDate!: string;
  days!: StudentWeeklyScheduleDayDto[];
}
