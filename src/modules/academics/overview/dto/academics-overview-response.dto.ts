export enum AcademicsOverviewCalendarEventTypeDto {
  HOLIDAY = 'holiday',
  EXAM = 'exam',
  ACTIVITY = 'activity',
  OTHER = 'other',
}

export enum AcademicsOverviewCalendarScopeTypeDto {
  SCHOOL = 'school',
  STAGE = 'stage',
  GRADE = 'grade',
  SECTION = 'section',
}

export class AcademicsOverviewAcademicYearDto {
  id!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  startDate!: string;
  endDate!: string;
  isActive!: boolean;
}

export class AcademicsOverviewTermDto {
  id!: string;
  academicYearId!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  startDate!: string;
  endDate!: string;
  isActive!: boolean;
}

export class AcademicsOverviewAcademicContextDto {
  academicYear!: AcademicsOverviewAcademicYearDto | null;
  term!: AcademicsOverviewTermDto | null;
}

export class AcademicsOverviewStructureDto {
  stagesCount!: number;
  gradesCount!: number;
  sectionsCount!: number;
  classroomsCount!: number;
}

export class AcademicsOverviewSubjectsDto {
  subjectsCount!: number;
  activeSubjectsCount!: number;
}

export class AcademicsOverviewRoomsDto {
  roomsCount!: number;
}

export class AcademicsOverviewTeacherAllocationDto {
  allocationsCount!: number;
  allocatedTeachersCount!: number;
  allocatedSubjectsCount!: number;
}

export class AcademicsOverviewCurriculumDto {
  curriculaCount!: number;
  activeCurriculaCount!: number;
  unitsCount!: number;
  lessonsCount!: number;
}

export class AcademicsOverviewLessonPlansDto {
  lessonPlansCount!: number;
  plannedItemsCount!: number;
}

export class AcademicsOverviewTimetableDto {
  entriesCount!: number;
  activeEntriesCount!: number;
}

export class AcademicsOverviewCalendarDto {
  eventsCount!: number;
  upcomingEventsCount!: number;
}

export class AcademicsOverviewCalendarEventScopeDto {
  type!: AcademicsOverviewCalendarScopeTypeDto;
  id!: string | null;
}

export class AcademicsOverviewUpcomingEventDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  title!: string;
  type!: AcademicsOverviewCalendarEventTypeDto;
  scope!: AcademicsOverviewCalendarEventScopeDto;
  allDay!: boolean;
  startDate!: string;
  endDate!: string;
}

export class AcademicsOverviewSetupIndicatorsDto {
  hasAcademicYear!: boolean;
  hasTerm!: boolean;
  hasStructure!: boolean;
  hasSubjects!: boolean;
  hasRooms!: boolean;
  hasTeacherAllocations!: boolean;
  hasCurriculum!: boolean;
  hasLessonPlans!: boolean;
  hasTimetable!: boolean;
  hasCalendarEvents!: boolean;
  readyForScheduling!: boolean;
  readyForLearningFlow!: boolean;
}

export class AcademicsOverviewDeferredDto {
  advancedAnalytics!: true;
  alertsLifecycle!: true;
  appFacingOverview!: true;
}

export class AcademicsOverviewResponseDto {
  generatedAt!: string;
  academicContext!: AcademicsOverviewAcademicContextDto;
  structure!: AcademicsOverviewStructureDto;
  subjects!: AcademicsOverviewSubjectsDto;
  rooms!: AcademicsOverviewRoomsDto;
  teacherAllocation!: AcademicsOverviewTeacherAllocationDto;
  curriculum!: AcademicsOverviewCurriculumDto;
  lessonPlans!: AcademicsOverviewLessonPlansDto;
  timetable!: AcademicsOverviewTimetableDto;
  calendar!: AcademicsOverviewCalendarDto;
  upcomingEvents!: AcademicsOverviewUpcomingEventDto[];
  setupIndicators!: AcademicsOverviewSetupIndicatorsDto;
  deferred!: AcademicsOverviewDeferredDto;
}
