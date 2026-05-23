import { IsString, Matches } from 'class-validator';

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class TeacherScheduleDateQueryDto {
  @IsString()
  @Matches(YYYY_MM_DD_PATTERN)
  date!: string;
}

export class TeacherSchedulePeriodDto {
  id!: string;
  index!: number;
  label!: string;
  startTime!: string;
  endTime!: string;
}

export class TeacherScheduleSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
}

export class TeacherScheduleClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TeacherScheduleRoomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TeacherScheduleItemDto {
  scheduleId!: string;
  timetableEntryId!: string;
  teacherSubjectAllocationId!: string;
  classId!: string;
  period!: TeacherSchedulePeriodDto;
  subject!: TeacherScheduleSubjectDto;
  classroom!: TeacherScheduleClassroomDto;
  room!: TeacherScheduleRoomDto | null;
  notes!: string | null;
  status!: 'scheduled' | 'upcoming' | 'current' | 'completed';
  needsAttendance!: boolean;
  isPrepared!: boolean | null;
  hasHomework!: boolean | null;
}

export class TeacherDailyScheduleResponseDto {
  date!: string;
  dayOfWeek!: number;
  items!: TeacherScheduleItemDto[];
}

export class TeacherWeeklyScheduleDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: TeacherScheduleItemDto[];
}

export class TeacherWeeklyScheduleResponseDto {
  weekStartDate!: string;
  weekEndDate!: string;
  days!: TeacherWeeklyScheduleDayDto[];
}
