export class TimetableConfigResponseDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  name!: string;
  weekStartDay!: number;
  activeDays!: number[];
  scopeType!: string;
  scopeKey!: string;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
  status!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class TimetableConfigEnvelopeDto {
  data!: TimetableConfigResponseDto;
}

export class TimetablePeriodResponseDto {
  id!: string;
  timetableConfigId!: string;
  index!: number;
  label!: string;
  startTime!: string;
  endTime!: string;
  timeRange!: string;
  type!: string;
  isInstructional!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class TimetablePeriodsListResponseDto {
  items!: TimetablePeriodResponseDto[];
}

export class DeleteTimetablePeriodResponseDto {
  ok!: boolean;
}

export class TimetablePreviewEntryDto {
  id!: string;
  dayOfWeek!: number;
  periodId!: string;
  periodIndex!: number;
  classroomId!: string;
  subjectId!: string;
  teacherUserId!: string;
  teacherSubjectAllocationId!: string;
  roomId!: string | null;
  notes!: string | null;
  status!: string;
}

export class TimetableConflictResponseDto {
  id!: string;
  type!: string;
  severity!: string;
  status!: string;
  dayOfWeek!: number | null;
  periodId!: string | null;
  entryId!: string | null;
  relatedEntryId!: string | null;
  teacherUserId!: string | null;
  roomId!: string | null;
  message!: string;
}

export class TimetableConflictsListResponseDto {
  items!: TimetableConflictResponseDto[];
}

export class TimetablePreviewResponseDto {
  config!: TimetableConfigResponseDto;
  periods!: TimetablePeriodResponseDto[];
  activeDays!: number[];
  entries!: TimetablePreviewEntryDto[];
  conflicts!: TimetableConflictResponseDto[];
}
