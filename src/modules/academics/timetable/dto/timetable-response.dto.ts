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

export class TimetableEntryPeriodSummaryDto {
  id!: string;
  index!: number;
  label!: string;
  startTime!: string;
  endTime!: string;
}

export class TimetableEntryClassroomSummaryDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TimetableEntrySubjectSummaryDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
}

export class TimetableEntryTeacherSummaryDto {
  userId!: string;
  fullName!: string;
}

export class TimetableEntryRoomSummaryDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TimetableEntryResponseDto {
  id!: string;
  timetableConfigId!: string;
  periodId!: string;
  dayOfWeek!: number;
  period!: TimetableEntryPeriodSummaryDto;
  classroom!: TimetableEntryClassroomSummaryDto;
  subject!: TimetableEntrySubjectSummaryDto;
  teacher!: TimetableEntryTeacherSummaryDto;
  room!: TimetableEntryRoomSummaryDto | null;
  teacherSubjectAllocationId!: string;
  notes!: string | null;
  status!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class TimetableEntriesListResponseDto {
  items!: TimetableEntryResponseDto[];
}

export class DeleteTimetableEntryResponseDto {
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
  entryIds!: string[];
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
  publishReadiness!: TimetablePublishReadinessResponseDto;
}

export class TimetablePublishBlockingReasonResponseDto {
  code!: string;
  message!: string;
  details?: Record<string, unknown>;
}

export class TimetablePublishReadinessResponseDto {
  canPublish!: boolean;
  blockingReasons!: TimetablePublishBlockingReasonResponseDto[];
  warnings!: TimetablePublishBlockingReasonResponseDto[];
}

export class TimetablePublicationSummaryResponseDto {
  periodsCount!: number;
  instructionalPeriodsCount!: number;
  entriesCount!: number;
  conflictsCount!: number;
  activeDays!: number[];
  scopeType!: string;
  academicYearId!: string;
  termId!: string;
}

export class TimetablePublicationResponseDto {
  timetableConfigId!: string;
  status!: string;
  revision!: number;
  publishedAt!: string | null;
  publishedByUserId!: string | null;
  canPublish!: boolean;
  blockingReasons!: TimetablePublishBlockingReasonResponseDto[];
  summary!: TimetablePublicationSummaryResponseDto;
}

export class TimetableDashboardClassroomContextDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TimetableDashboardGradeContextDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TimetableDashboardConfigSummaryDto {
  id!: string;
  name!: string;
  scopeType!: string;
  scopeKey!: string;
  status!: string;
  activeDays!: number[];
}

export class TimetableDashboardItemDto {
  classroomId!: string;
  classroom!: TimetableDashboardClassroomContextDto;
  gradeId!: string;
  grade!: TimetableDashboardGradeContextDto;
  configs!: TimetableDashboardConfigSummaryDto[];
  periods!: TimetablePeriodResponseDto[];
  entries!: TimetableEntryResponseDto[];
}

export class TimetableDashboardAllResponseDto {
  termId!: string;
  academicYearId!: string;
  publishedAt!: string | null;
  isPublished!: boolean;
  items!: TimetableDashboardItemDto[];
}

export class TimetableEntriesBulkResponseDto
  extends TimetableEntriesListResponseDto {
  summary!: {
    requestedCount: number;
    createdCount: number;
    updatedCount: number;
  };
}

export class TimetableUnpublishResponseDto {
  termId!: string;
  academicYearId!: string;
  summary!: {
    configsChecked: number;
    unpublishedCount: number;
    entriesReturnedToDraft: number;
  };
}

export type TimetableValidationItemStatus =
  | 'complete'
  | 'under_scheduled'
  | 'over_scheduled'
  | 'missing_teacher_allocation'
  | 'missing_subject_allocation';

export class TimetableValidationIssueDto {
  code!: string;
  message!: string;
  details?: Record<string, unknown>;
}

export class TimetableValidationItemDto {
  classroomId!: string;
  classroom!: TimetableDashboardClassroomContextDto;
  gradeId!: string;
  grade!: TimetableDashboardGradeContextDto;
  subjectId!: string | null;
  subject!: {
    id: string;
    nameAr: string;
    nameEn: string;
    code: string | null;
    color: string | null;
  } | null;
  expectedWeeklyHours!: number | null;
  scheduledWeeklyHours!: number;
  status!: TimetableValidationItemStatus;
  issues!: TimetableValidationIssueDto[];
}

export class TimetableValidationResponseDto {
  termId!: string;
  academicYearId!: string;
  summary!: {
    classroomsChecked: number;
    expectedWeeklySlots: number;
    actualScheduledSlots: number;
    missingTeacherAllocations: number;
    underScheduledSubjects: number;
    overScheduledSubjects: number;
    teacherConflicts: number;
    classroomConflicts: number;
    roomConflicts: number;
    missingSubjectAllocationRows: number;
  };
  items!: TimetableValidationItemDto[];
}

export class TimetableConflictCheckItemDto {
  code!: string;
  message!: string;
  severity!: string;
  dayOfWeek!: number | null;
  periodId!: string | null;
  classroomId!: string | null;
  teacherUserId!: string | null;
  roomId!: string | null;
  entryIds!: string[];
  proposedIndexes!: number[];
}

export class TimetableConflictCheckResponseDto {
  termId!: string;
  academicYearId!: string;
  hasConflicts!: boolean;
  conflicts!: TimetableConflictCheckItemDto[];
}
